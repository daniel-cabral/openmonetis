import type { UIMessage } from "ai";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { plannerMessages } from "@/db/schema";

type Conflict = { set: Record<string, unknown>; setWhere?: SQL };

const mocks = vi.hoisted(() => {
	const selectResults: unknown[][] = [];
	const selects: { where?: SQL }[] = [];
	const inserts: { table: unknown; values?: unknown[]; conflict?: Conflict }[] =
		[];

	const select = () => {
		const record: { where?: SQL } = {};
		selects.push(record);
		const rows = selectResults.shift() ?? [];
		const chain = Object.assign(Promise.resolve(rows), {
			from: () => chain,
			where: (condition: SQL) => {
				record.where = condition;
				return chain;
			},
			orderBy: () => chain,
			limit: () => chain,
		});
		return chain;
	};
	const insert = (table: unknown) => {
		const record: { table: unknown; values?: unknown[]; conflict?: Conflict } =
			{ table };
		inserts.push(record);
		return {
			values: (rows: unknown[]) => {
				record.values = rows;
				return {
					onConflictDoUpdate: (conflict: Conflict) => {
						record.conflict = conflict;
						return Promise.resolve([]);
					},
				};
			},
		};
	};
	const update = () => ({
		set: () => ({ where: () => Promise.resolve([]) }),
	});
	const dbMock = {
		select,
		insert,
		update,
		transaction: (callback: (tx: unknown) => unknown) => callback(dbMock),
	};
	return { selectResults, selects, inserts, dbMock };
});

vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));

import { loadConversation, saveMessages } from "./conversation-store";

const USER_ID = "user-1";
const CONVERSATION_ID = "123e4567-e89b-12d3-a456-426614174000";

const params = (condition: SQL | undefined) =>
	new PgDialect().sqlToQuery(condition as SQL).params;

const message = (id: string): UIMessage => ({
	id,
	role: "user",
	parts: [{ type: "text", text: "oi" }],
});

beforeEach(() => {
	mocks.selectResults.length = 0;
	mocks.selects.length = 0;
	mocks.inserts.length = 0;
});

describe("conversation store", () => {
	it("não lê mensagens de conversa que não pertence ao usuário", async () => {
		mocks.selectResults.push([]);

		await expect(
			loadConversation(USER_ID, CONVERSATION_ID),
		).resolves.toBeNull();
		expect(mocks.selects).toHaveLength(1);
		expect(params(mocks.selects[0].where)).toEqual(
			expect.arrayContaining([USER_ID, CONVERSATION_ID]),
		);
	});

	it("lê mensagens filtrando por usuário além da conversa", async () => {
		mocks.selectResults.push([{ id: CONVERSATION_ID, title: "t" }], []);

		await loadConversation(USER_ID, CONVERSATION_ID);

		expect(params(mocks.selects[1].where)).toEqual(
			expect.arrayContaining([USER_ID, CONVERSATION_ID]),
		);
	});

	it("grava as mensagens em um insert e não sobrescreve linha de outro usuário", async () => {
		await saveMessages(USER_ID, CONVERSATION_ID, [
			message("msg-1"),
			message("msg-2"),
		]);

		const [write] = mocks.inserts;
		expect(mocks.inserts).toHaveLength(1);
		expect(write.table).toBe(plannerMessages);
		expect(write.values).toHaveLength(2);
		expect(write.conflict?.set).toHaveProperty("parts");
		expect(
			new PgDialect().sqlToQuery(write.conflict?.set.parts as SQL).sql,
		).toBe('excluded."partes"');
		expect(params(write.conflict?.setWhere)).toEqual(
			expect.arrayContaining([USER_ID, "assistant"]),
		);
	});
});
