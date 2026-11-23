import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { transactions } from "@/db/schema";

type MockChain = {
	from: (table: unknown) => MockChain;
	leftJoin: () => MockChain;
	where: (condition: unknown) => MockChain;
	orderBy: () => MockChain;
	limit: () => MockChain;
	then: (
		resolve: (value: unknown[]) => unknown,
		reject?: (reason: unknown) => unknown,
	) => Promise<unknown>;
};

const mocks = vi.hoisted(() => {
	const rowsByTable = new Map<unknown, unknown[]>();
	const wheres: { table: unknown; condition: unknown }[] = [];
	const getAdminPayerIdMock = vi.fn();
	const dbMock = {
		select: () => {
			let table: unknown;
			const chain: MockChain = {
				from(target) {
					table = target;
					return chain;
				},
				leftJoin: () => chain,
				where(condition) {
					wheres.push({ table, condition });
					return chain;
				},
				orderBy: () => chain,
				limit: () => chain,
				// biome-ignore lint/suspicious/noThenProperty: mock de query drizzle thenable, o await precisa do then
				then(resolve, reject) {
					return Promise.resolve(rowsByTable.get(table) ?? []).then(
						resolve,
						reject,
					);
				},
			};
			return chain;
		},
	};
	return { rowsByTable, wheres, getAdminPayerIdMock, dbMock };
});

vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/payers/get-admin-id", () => ({
	getAdminPayerId: mocks.getAdminPayerIdMock,
}));

import { fetchPlanningSnapshot } from "./queries";

const USER_ID = "user-1";
// 23 de novembro de 2026: mês corrente 2026-11, últimos meses completos a partir de 2026-10.
const NOW = new Date(2026, 10, 23);

const render = (condition: unknown) =>
	new PgDialect().sqlToQuery(
		condition as Parameters<PgDialect["sqlToQuery"]>[0],
	);

beforeEach(() => {
	mocks.rowsByTable.clear();
	mocks.wheres.length = 0;
	mocks.getAdminPayerIdMock.mockReset();
});

describe("fetchPlanningSnapshot", () => {
	it("lê lançamentos só do usuário, do pagador admin e dos períodos da janela", async () => {
		mocks.getAdminPayerIdMock.mockResolvedValue("admin");

		await fetchPlanningSnapshot(USER_ID, NOW);

		const transactionsWhere = mocks.wheres.find(
			(call) => call.table === transactions,
		);
		expect(render(transactionsWhere?.condition).params).toEqual(
			expect.arrayContaining([USER_ID, "admin", "2026-10"]),
		);
	});

	it("usuário sem pagador admin recebe snapshot vazio sem lançar erro", async () => {
		mocks.getAdminPayerIdMock.mockResolvedValue(null);

		const snapshot = await fetchPlanningSnapshot(USER_ID, NOW);

		expect(snapshot.input).toMatchObject({
			incomeBaseline: 0,
			costOfLiving: 0,
			positions: [],
			plans: [],
			potAccountIds: [],
		});
		expect(snapshot.accounts).toEqual([]);
		expect(snapshot.plans).toEqual([]);
	});
});
