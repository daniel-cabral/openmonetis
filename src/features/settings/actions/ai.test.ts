import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUserIdMock, revalidatePathMock, state, dbMock } = vi.hoisted(() => {
	type Row = Record<string, unknown>;
	const state = {
		credentials: [] as Row[],
		pending: [] as Row[],
		wheres: [] as unknown[],
		writes: 0,
	};
	return {
		getUserIdMock: vi.fn(),
		revalidatePathMock: vi.fn(),
		state,
		dbMock: {} as Record<string, unknown>,
	};
});

vi.mock("@/shared/lib/auth/server", () => ({ getUserId: getUserIdMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/shared/lib/db", () => ({ db: dbMock }));

import { aiCredentials } from "@/db/schema";
import {
	cancelChatGptConnectionAction,
	pollChatGptConnectionAction,
	removeAiCredentialAction,
	saveAiApiKeyAction,
	startChatGptConnectionAction,
} from "./ai";

type Row = Record<string, unknown>;
const dialect = new PgDialect();
const paramsOf = (condition: unknown) =>
	dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0])
		.params;

function tableRows(table: unknown): Row[] {
	return table === aiCredentials ? state.credentials : state.pending;
}

Object.assign(dbMock, {
	select: () => ({
		from: (table: unknown) => ({
			where: (condition: unknown) => {
				state.wheres.push(condition);
				return Promise.resolve([...tableRows(table)]);
			},
		}),
	}),
	insert: (table: unknown) => ({
		values: (values: Row) => ({
			onConflictDoUpdate: () => {
				state.writes += 1;
				const rows = tableRows(table);
				const index =
					table === aiCredentials
						? rows.findIndex((row) => row.provider === values.provider)
						: 0;
				if (index >= 0 && rows[index]) rows[index] = { ...values };
				else rows.push({ ...values });
				return Promise.resolve();
			},
		}),
	}),
	delete: (table: unknown) => ({
		where: (condition: unknown) => {
			state.wheres.push(condition);
			state.writes += 1;
			const rows = tableRows(table);
			const params = paramsOf(condition);
			for (let i = rows.length - 1; i >= 0; i--) {
				const provider = rows[i]?.provider;
				if (table !== aiCredentials || params.includes(provider)) {
					rows.splice(i, 1);
				}
			}
			return Promise.resolve();
		},
	}),
});

const b64 = (value: unknown) =>
	Buffer.from(JSON.stringify(value)).toString("base64url");
const accessToken = `${b64({ alg: "none" })}.${b64({
	exp: Math.floor(new Date("2030-01-01T00:00:00Z").getTime() / 1000),
	"https://api.openai.com/auth": {
		chatgpt_account_id: "acc-1",
		chatgpt_plan_type: "plus",
	},
	"https://api.openai.com/profile": { email: "ana@example.com" },
})}.sig`;

const json = (status: number, body: unknown = {}) =>
	new Response(JSON.stringify(body), { status });

beforeEach(() => {
	state.credentials.length = 0;
	state.pending.length = 0;
	state.wheres.length = 0;
	state.writes = 0;
	getUserIdMock.mockResolvedValue("u1");
	vi.stubEnv("BETTER_AUTH_SECRET", "test-secret");
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe("ai settings actions", () => {
	it("saves, masks and removes keys only for the signed-in user", async () => {
		const key = "sk-proj-abcdefghijklmnopa3F9";
		const saved = await saveAiApiKeyAction({ provider: "openai", apiKey: key });

		expect(saved.data).toEqual({
			provider: "openai",
			status: "connected",
			secretMask: "sk-…a3F9",
			baseUrl: null,
			accountEmail: null,
			planType: null,
		});
		expect(JSON.stringify(saved)).not.toContain(key);

		state.writes = 0;
		expect(
			await saveAiApiKeyAction({ provider: "ollama", baseUrl: "ftp://x" }),
		).toEqual({ success: false, error: "Informe uma URL http(s) válida." });
		expect(state.writes).toBe(0);

		await removeAiCredentialAction("anthropic");
		expect(paramsOf(state.wheres.at(-1))).toContain("u1");
	});

	it("device flow stores the session on approval and stops after expiry or cancel", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		fetchMock.mockResolvedValueOnce(
			json(200, {
				user_code: "ABCD-1234",
				device_auth_id: "dev-1",
				interval: "5",
			}),
		);
		const started = await startChatGptConnectionAction();
		expect(started.data).toMatchObject({ userCode: "ABCD-1234" });
		expect(JSON.stringify(started)).not.toContain("dev-1");

		fetchMock.mockResolvedValueOnce(json(403));
		expect((await pollChatGptConnectionAction()).data?.state).toBe("pending");

		fetchMock
			.mockResolvedValueOnce(
				json(200, { authorization_code: "code", code_verifier: "verifier" }),
			)
			.mockResolvedValueOnce(
				json(200, {
					access_token: accessToken,
					refresh_token: "refresh",
					id_token: "id",
					expires_in: 3600,
				}),
			);
		const connected = await pollChatGptConnectionAction();
		expect(connected.data).toEqual({
			state: "connected",
			accountEmail: "ana@example.com",
			planType: "plus",
		});
		expect(state.pending).toHaveLength(0);
		expect(state.credentials[0]).toMatchObject({ provider: "chatgpt" });

		fetchMock.mockResolvedValueOnce(
			json(200, {
				user_code: "WXYZ-9999",
				device_auth_id: "dev-2",
				interval: "5",
			}),
		);
		await startChatGptConnectionAction();
		fetchMock.mockClear();
		vi.setSystemTime(new Date("2026-01-01T00:16:00Z"));
		expect((await pollChatGptConnectionAction()).data?.state).toBe("expired");
		expect(fetchMock).not.toHaveBeenCalled();

		fetchMock.mockResolvedValueOnce(
			json(200, {
				user_code: "QQQQ-0000",
				device_auth_id: "dev-3",
				interval: "5",
			}),
		);
		await startChatGptConnectionAction();
		fetchMock.mockClear();
		await cancelChatGptConnectionAction();
		expect((await pollChatGptConnectionAction()).data?.state).toBe(
			"disconnected",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
