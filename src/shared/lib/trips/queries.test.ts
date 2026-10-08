import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	type Chain = Promise<unknown[]> & {
		from: () => Chain;
		where: (condition: unknown) => Chain;
		orderBy: () => Chain;
		limit: () => Chain;
	};
	const queue: unknown[][] = [];
	const wheres: unknown[] = [];
	const select = () => {
		const chain: Chain = Object.assign(Promise.resolve(queue.shift() ?? []), {
			from: () => chain,
			where: (condition: unknown) => {
				wheres.push(condition);
				return chain;
			},
			orderBy: () => chain,
			limit: () => chain,
		});
		return chain;
	};
	return { queue, wheres, dbMock: { select }, getUserIdMock: vi.fn() };
});

vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/auth/server", () => ({ getUserId: mocks.getUserIdMock }));

import { fetchTripOptionsAction } from "./actions";
import {
	fetchUserTrips,
	TRIP_NOT_FOUND_MESSAGE,
	validateTripOwnership,
} from "./queries";

const USER_ID = "user-1";
const render = (condition: unknown) =>
	new PgDialect().sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);

beforeEach(() => {
	mocks.queue.length = 0;
	mocks.wheres.length = 0;
	mocks.getUserIdMock.mockResolvedValue(USER_ID);
});

describe("fetchUserTrips", () => {
	it("devolve datas YYYY-MM-DD e filtra por userId", async () => {
		mocks.queue.push([
			{
				id: "t1",
				name: "Lisboa",
				startDate: new Date(Date.UTC(2026, 4, 12)),
				endDate: new Date(Date.UTC(2026, 4, 22)),
			},
		]);

		const result = await fetchUserTrips(USER_ID);

		expect(result).toEqual([
			{ id: "t1", name: "Lisboa", startDate: "2026-05-12", endDate: "2026-05-22" },
		]);
		const where = render(mocks.wheres[0]);
		expect(where.sql).toContain('"user_id" = $1');
		expect(where.params).toEqual([USER_ID]);
	});
});

describe("validateTripOwnership", () => {
	it("aceita ausência de viagem sem consultar o banco", async () => {
		expect(await validateTripOwnership(USER_ID, null)).toBeNull();
		expect(await validateTripOwnership(USER_ID, undefined)).toBeNull();
		expect(mocks.wheres).toHaveLength(0);
	});

	it("rejeita viagem que não é do usuário", async () => {
		mocks.queue.push([]);
		expect(await validateTripOwnership(USER_ID, "t-outro")).toBe(
			TRIP_NOT_FOUND_MESSAGE,
		);
		const where = render(mocks.wheres[0]);
		expect(where.params).toEqual(expect.arrayContaining([USER_ID, "t-outro"]));
	});

	it("aceita viagem do usuário", async () => {
		mocks.queue.push([{ id: "t1" }]);
		expect(await validateTripOwnership(USER_ID, "t1")).toBeNull();
	});
});

describe("fetchTripOptionsAction", () => {
	it("usa o usuário da sessão", async () => {
		mocks.queue.push([]);
		await fetchTripOptionsAction();
		expect(render(mocks.wheres[0]).params).toEqual([USER_ID]);
	});
});
