import { describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "../credentials/cipher";
import {
	AiCredentialInvalidError,
	AiReconnectRequiredError,
} from "../credentials/errors";
import {
	type ChatGptCredentialDependencies,
	getChatGptAccessToken,
} from "./credentials";
import type { ChatGptTokens } from "./oauth";

const SECRET = "test-secret";
const NOW = new Date("2026-06-01T00:00:00Z");
const HOUR = 60 * 60 * 1000;

function jwt(expSeconds: number): string {
	const part = (value: object) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${part({ alg: "none" })}.${part({
		"https://api.openai.com/auth": { chatgpt_account_id: "acc" },
		exp: expSeconds,
	})}.sig`;
}

type Row = Record<string, unknown>;

function createFakeDatabase(initial: Row) {
	const row: Row = { ...initial };
	const updates: Row[] = [];
	let lockChain: Promise<unknown> = Promise.resolve();
	let lockCalls = 0;
	const tx = {
		select: () => ({
			from: () => ({
				where: () => ({
					for: () => Promise.resolve([row]),
				}),
			}),
		}),
		update: () => ({
			set: (values: Row) => ({
				where: () => {
					Object.assign(row, values);
					updates.push(values);
					return Promise.resolve();
				},
			}),
		}),
	};
	const database = {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve([{ ...row }]),
			}),
		}),
		update: tx.update,
		// Serializes transactions like SELECT ... FOR UPDATE does.
		transaction: (callback: (t: typeof tx) => Promise<unknown>) => {
			lockCalls += 1;
			const result = lockChain.then(() => callback(tx));
			lockChain = result.catch(() => undefined);
			return result;
		},
	};
	return {
		database: database as unknown as NonNullable<
			ChatGptCredentialDependencies["database"]
		>,
		row,
		updates,
		lockCalls: () => lockCalls,
	};
}

function staleRow(secret = SECRET): Row {
	return {
		status: "connected",
		accountId: "acc",
		accessExpiresAt: new Date(NOW.getTime() + HOUR),
		encryptedSecret: encryptSecret(
			{ accessToken: "old-at", refreshToken: "old-rt" },
			secret,
		),
	};
}

describe("chatgpt access token store", () => {
	it("returns the stored token without refreshing when it has more than 24h left", async () => {
		const fake = createFakeDatabase({
			...staleRow(),
			accessExpiresAt: new Date(NOW.getTime() + 48 * HOUR),
		});
		const refresh = vi.fn();

		const token = await getChatGptAccessToken("u1", {
			database: fake.database,
			secret: SECRET,
			now: () => NOW,
			refresh,
		});

		expect(token).toEqual({ accessToken: "old-at", accountId: "acc" });
		expect(refresh).not.toHaveBeenCalled();
		expect(fake.lockCalls()).toBe(0);
	});

	it("refreshes under a row lock once and persists the rotated refresh token", async () => {
		const fake = createFakeDatabase(staleRow());
		const newAccess = jwt(NOW.getTime() / 1000 + 10 * 24 * 3600);
		const refresh = vi.fn(
			async (): Promise<ChatGptTokens> => ({
				accessToken: newAccess,
				refreshToken: "new-rt",
				idToken: "id",
				expiresIn: 3600,
			}),
		);
		const deps = {
			database: fake.database,
			secret: SECRET,
			now: () => NOW,
			refresh,
		};

		const [first, second] = await Promise.all([
			getChatGptAccessToken("u1", deps),
			getChatGptAccessToken("u1", deps),
		]);

		expect(refresh).toHaveBeenCalledTimes(1);
		expect(first.accessToken).toBe(newAccess);
		expect(second.accessToken).toBe(newAccess);
		expect(decryptSecret(String(fake.row.encryptedSecret), SECRET)).toEqual({
			accessToken: newAccess,
			refreshToken: "new-rt",
		});
	});

	it("marks the connection expired when the refresh is refused", async () => {
		const fake = createFakeDatabase(staleRow());

		await expect(
			getChatGptAccessToken("u1", {
				database: fake.database,
				secret: SECRET,
				now: () => NOW,
				refresh: async () => {
					throw new AiReconnectRequiredError("chatgpt");
				},
			}),
		).rejects.toBeInstanceOf(AiReconnectRequiredError);
		expect(fake.updates).toEqual([
			expect.objectContaining({ status: "needs_reconnect" }),
		]);
	});

	it("marks the credential invalid, not expired, when the secret no longer decrypts", async () => {
		const fake = createFakeDatabase(staleRow("old-secret"));
		const refresh = vi.fn();

		await expect(
			getChatGptAccessToken("u1", {
				database: fake.database,
				secret: SECRET,
				now: () => NOW,
				refresh,
			}),
		).rejects.toBeInstanceOf(AiCredentialInvalidError);
		expect(fake.updates).toEqual([
			expect.objectContaining({ status: "invalid_secret" }),
		]);
		expect(refresh).not.toHaveBeenCalled();
	});
});
