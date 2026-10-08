import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	type Chain = Promise<unknown[]> & {
		from: () => Chain;
		leftJoin: () => Chain;
		where: (condition: unknown) => Chain;
		groupBy: () => Chain;
		orderBy: () => Chain;
		limit: () => Chain;
	};
	const queue: unknown[][] = [];
	const wheres: unknown[] = [];
	const select = () => {
		const chain: Chain = Object.assign(Promise.resolve(queue.shift() ?? []), {
			from: () => chain,
			leftJoin: () => chain,
			where: (condition: unknown) => {
				wheres.push(condition);
				return chain;
			},
			groupBy: () => chain,
			orderBy: () => chain,
			limit: () => chain,
		});
		return chain;
	};
	return { queue, wheres, dbMock: { select }, getAdminPayerIdMock: vi.fn() };
});

vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/payers/get-admin-id", () => ({
	getAdminPayerId: mocks.getAdminPayerIdMock,
}));

import { dedupeSuggestions } from "./lib/suggestions";
import { fetchTripDetail } from "./queries";

const USER_ID = "user-1";
const TRIP_ID = "trip-lisboa";
const render = (condition: unknown) =>
	new PgDialect().sqlToQuery(
		condition as Parameters<PgDialect["sqlToQuery"]>[0],
	);

const dbRow = (overrides: Record<string, unknown>) => ({
	id: "r",
	name: "Uber",
	purchaseDate: new Date(Date.UTC(2026, 4, 13)),
	amount: "-42.50",
	transactionType: "Despesa",
	payerId: "admin",
	payerName: "Eu",
	categoryName: "Transporte",
	cardName: "C6",
	accountName: null,
	currentInstallment: null,
	installmentCount: null,
	seriesId: null,
	splitGroupId: null,
	...overrides,
});

beforeEach(() => {
	mocks.queue.length = 0;
	mocks.wheres.length = 0;
	mocks.getAdminPayerIdMock.mockResolvedValue("admin");
});

describe("dedupeSuggestions", () => {
	it("parcelas e divisão aparecem uma vez; recorrente aparece por ocorrência", () => {
		const rows = [
			{ id: "p1", installmentCount: 10, seriesId: "tap", splitGroupId: null },
			{ id: "p2", installmentCount: 10, seriesId: "tap", splitGroupId: null },
			{
				id: "j1",
				installmentCount: null,
				seriesId: null,
				splitGroupId: "jantar",
			},
			{
				id: "j2",
				installmentCount: null,
				seriesId: null,
				splitGroupId: "jantar",
			},
			{
				id: "r1",
				installmentCount: null,
				seriesId: "netflix",
				splitGroupId: null,
			},
			{
				id: "r2",
				installmentCount: null,
				seriesId: "netflix",
				splitGroupId: null,
			},
			{ id: "u", installmentCount: null, seriesId: null, splitGroupId: null },
		];
		expect(dedupeSuggestions(rows).map((r) => r.id)).toEqual([
			"p1",
			"j1",
			"r1",
			"r2",
			"u",
		]);
	});
});

describe("fetchTripDetail", () => {
	it("viagem de outro usuário volta null", async () => {
		mocks.queue.push([]);
		expect(await fetchTripDetail(USER_ID, TRIP_ID)).toBeNull();
		expect(render(mocks.wheres[0]).params).toEqual(
			expect.arrayContaining([TRIP_ID, USER_ID]),
		);
	});

	it("monta resumo, vinculados e sugestões filtrados por userId", async () => {
		mocks.queue.push([
			{
				id: TRIP_ID,
				name: "Lisboa",
				startDate: new Date(Date.UTC(2026, 4, 12)),
				endDate: new Date(Date.UTC(2026, 4, 22)),
				note: null,
			},
		]);
		mocks.queue.push([dbRow({ id: "uber" })]);
		mocks.queue.push([
			dbRow({ id: "p1", seriesId: "tap", installmentCount: 10 }),
			dbRow({ id: "p2", seriesId: "tap", installmentCount: 10 }),
		]);

		const detail = await fetchTripDetail(USER_ID, TRIP_ID);

		expect(detail?.trip).toEqual({
			id: TRIP_ID,
			name: "Lisboa",
			startDate: "2026-05-12",
			endDate: "2026-05-22",
			note: null,
		});
		expect(detail?.linked[0]).toMatchObject({
			id: "uber",
			amount: -42.5,
			purchaseDate: "2026-05-13",
		});
		expect(detail?.summary.netCost).toBe(42.5);
		expect(detail?.suggestions.map((s) => s.id)).toEqual(["p1"]);

		const linkedWhere = render(mocks.wheres[1]);
		expect(linkedWhere.sql).toContain('"user_id" =');
		expect(linkedWhere.sql).toContain('"viagem_id" =');

		const suggestionsWhere = render(mocks.wheres[2]);
		expect(suggestionsWhere.sql).toContain('"user_id" =');
		expect(suggestionsWhere.sql).toContain('"viagem_id" is null');
		expect(suggestionsWhere.sql).toContain('"data_compra" >=');
		expect(suggestionsWhere.sql).toContain('"data_compra" <=');
		expect(suggestionsWhere.sql).toContain('"transfer_id" is null');
	});
});
