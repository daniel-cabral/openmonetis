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
	const projections: unknown[] = [];
	const select = (projection?: unknown) => {
		projections.push(projection);
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
	return {
		queue,
		wheres,
		projections,
		dbMock: { select },
		getAdminPayerIdMock: vi.fn(),
	};
});

vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/payers/get-admin-id", () => ({
	getAdminPayerId: mocks.getAdminPayerIdMock,
}));

import { fetchTripsOverview } from "./queries";

const USER_ID = "user-1";
const render = (condition: unknown) =>
	new PgDialect().sqlToQuery(
		condition as Parameters<PgDialect["sqlToQuery"]>[0],
	);
const netCostOf = () => (mocks.projections[0] as { netCost: unknown }).netCost;

beforeEach(() => {
	mocks.queue.length = 0;
	mocks.wheres.length = 0;
	mocks.projections.length = 0;
	mocks.getAdminPayerIdMock.mockResolvedValue("admin");
});

describe("fetchTripsOverview", () => {
	it("converte totais e datas e filtra por userId", async () => {
		mocks.queue.push([
			{
				id: "t1",
				name: "Lisboa",
				startDate: new Date(Date.UTC(2026, 4, 12)),
				endDate: new Date(Date.UTC(2026, 4, 22)),
				note: null,
				linkedCount: 24,
				netCost: "8412.30",
			},
		]);

		expect(await fetchTripsOverview(USER_ID)).toEqual([
			{
				id: "t1",
				name: "Lisboa",
				startDate: "2026-05-12",
				endDate: "2026-05-22",
				note: null,
				linkedCount: 24,
				netCost: 8412.3,
			},
		]);
		const where = render(mocks.wheres[0]);
		expect(where.sql).toContain('"user_id" = $1');
		expect(where.params).toEqual([USER_ID]);

		const netCost = render(netCostOf());
		expect(netCost.sql).toContain("sum(-");
		expect(netCost.sql).toContain("filter (where");
		expect(netCost.params).toEqual(["admin", "Despesa", "Receita"]);
	});

	it("sem admin, custo zero", async () => {
		mocks.getAdminPayerIdMock.mockResolvedValue(null);
		mocks.queue.push([
			{
				id: "t1",
				name: "Lisboa",
				startDate: new Date(Date.UTC(2026, 4, 12)),
				endDate: new Date(Date.UTC(2026, 4, 22)),
				note: null,
				linkedCount: 3,
				netCost: "0",
			},
		]);
		expect((await fetchTripsOverview(USER_ID))[0]?.netCost).toBe(0);

		const netCost = render(netCostOf());
		expect(netCost.sql).toBe("0");
		expect(netCost.params).toEqual([]);
	});
});
