import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const ids = {
		MORADIA: "66666666-6666-4666-8666-666666666666",
		ALUGUEL: "77777777-7777-4777-8777-777777777777",
		FOREIGN_SUBCATEGORY: "88888888-8888-4888-8888-888888888888",
	};
	const writes: Array<{
		op: "insert" | "update" | "delete";
		table: unknown;
		values?: unknown;
	}> = [];

	// The fake cannot evaluate SQL conditions, so it reads their bound params
	// to find the foreign subcategory id and make that update match no rows.
	const touchesForeignId = (condition: unknown) =>
		new PgDialect()
			.sqlToQuery(condition as SQL)
			.params.includes(ids.FOREIGN_SUBCATEGORY);

	const dbMock = {
		query: { categories: { findFirst: vi.fn() } },
		insert: (table: unknown) => ({
			values: (values: unknown) => {
				writes.push({ op: "insert", table, values });
				return Object.assign(Promise.resolve(undefined), {
					returning: () => Promise.resolve([{ id: ids.MORADIA }]),
				});
			},
		}),
		update: (table: unknown) => ({
			set: (values: unknown) => ({
				where: (condition: unknown) => {
					writes.push({ op: "update", table, values });
					const rows = touchesForeignId(condition) ? [] : [{ id: ids.MORADIA }];
					return Object.assign(Promise.resolve(rows), {
						returning: () => Promise.resolve(rows),
					});
				},
			}),
		}),
		delete: (table: unknown) => ({
			where: () => {
				writes.push({ op: "delete", table });
				return Promise.resolve(undefined);
			},
		}),
		transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
			callback(dbMock),
		),
	};

	return {
		ids,
		writes,
		dbMock,
		getUserMock: vi.fn(),
	};
});

vi.mock("@/shared/lib/auth/server", () => ({ getUser: mocks.getUserMock }));
vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/actions/helpers", () => ({
	revalidateForEntity: vi.fn(),
	handleActionError: (error: unknown) => {
		const issues = (error as { issues?: Array<{ message: string }> }).issues;
		return { success: false, error: issues?.[0]?.message ?? "erro" };
	},
}));

import { subcategories } from "@/db/schema";
import { createCategoryAction, updateCategoryAction } from "./actions";

const USER_ID = "user-1";
const { MORADIA, ALUGUEL, FOREIGN_SUBCATEGORY } = mocks.ids;

const moradia = {
	id: MORADIA,
	name: "Moradia",
	type: "despesa" as const,
	icon: "RiHome4Line",
};

function subcategoryWrites(op: "insert" | "update" | "delete") {
	return mocks.writes
		.filter((write) => write.op === op && write.table === subcategories)
		.map((write) => write.values);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.writes.length = 0;
	mocks.getUserMock.mockResolvedValue({
		id: USER_ID,
		name: "Eu",
		email: "eu@x",
	});
	mocks.dbMock.query.categories.findFirst.mockResolvedValue({
		id: MORADIA,
		name: "Moradia",
	});
});

describe("updateCategoryAction", () => {
	it("grava Faxina e IPTU em Moradia junto com a categoria, numa transacao", async () => {
		const result = await updateCategoryAction({
			...moradia,
			subcategories: [
				{ id: ALUGUEL, name: "Aluguel" },
				{ name: "Faxina" },
				{ name: "IPTU" },
			],
		});

		expect(result.success).toBe(true);
		expect(mocks.dbMock.transaction).toHaveBeenCalledTimes(1);
		expect(subcategoryWrites("update")).toEqual([{ name: "Aluguel" }]);
		expect(subcategoryWrites("insert")).toEqual([
			[
				{ name: "Faxina", categoryId: MORADIA, userId: USER_ID },
				{ name: "IPTU", categoryId: MORADIA, userId: USER_ID },
			],
		]);
		expect(subcategoryWrites("delete")).toHaveLength(1);
	});

	it("nome repetido sem diferenciar maiusculas nem espacos falha e nada e gravado", async () => {
		const result = await updateCategoryAction({
			...moradia,
			subcategories: [{ id: ALUGUEL, name: "Faxina" }, { name: " faxina " }],
		});

		expect(result).toEqual({
			success: false,
			error: 'Já existe a subcategoria "faxina" nesta categoria.',
		});
		expect(mocks.dbMock.transaction).not.toHaveBeenCalled();
	});

	it("nome em branco falha com mensagem e nada e gravado", async () => {
		const result = await updateCategoryAction({
			...moradia,
			subcategories: [{ name: "   " }],
		});

		expect(result).toEqual({
			success: false,
			error: "Informe o nome da subcategoria.",
		});
		expect(mocks.dbMock.transaction).not.toHaveBeenCalled();
	});

	it("id de subcategoria de outra categoria falha sem inserir nada", async () => {
		const result = await updateCategoryAction({
			...moradia,
			subcategories: [{ id: FOREIGN_SUBCATEGORY, name: "Faxina" }],
		});

		expect(result).toEqual({
			success: false,
			error: "Subcategoria não encontrada.",
		});
		expect(subcategoryWrites("insert")).toEqual([]);
	});
});

describe("createCategoryAction", () => {
	it("cria a categoria com as subcategorias na mesma transacao", async () => {
		const result = await createCategoryAction({
			name: "Moradia",
			type: "despesa",
			icon: "RiHome4Line",
			subcategories: [{ name: "Faxina" }],
		});

		expect(result.success).toBe(true);
		expect(mocks.dbMock.transaction).toHaveBeenCalledTimes(1);
		expect(subcategoryWrites("insert")).toEqual([
			[{ name: "Faxina", categoryId: MORADIA, userId: USER_ID }],
		]);
	});
});
