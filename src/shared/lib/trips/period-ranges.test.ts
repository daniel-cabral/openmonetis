import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { whereMock, rowsQueue } = vi.hoisted(() => ({
	whereMock: vi.fn(),
	rowsQueue: [] as unknown[][],
}));

vi.mock("@/shared/lib/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: (condition: unknown) => {
					whereMock(condition);
					return {
						groupBy: () => Promise.resolve(rowsQueue.shift() ?? []),
					};
				},
			}),
		}),
	},
}));

import { fetchTripPeriodRanges } from "./period-ranges";

describe("fetchTripPeriodRanges", () => {
	beforeEach(() => {
		whereMock.mockReset();
		rowsQueue.length = 0;
	});

	it("devolve menor e maior período por viagem do usuário", async () => {
		rowsQueue.push([
			{ tripId: "lisboa", startPeriod: "2026-03", endPeriod: "2026-12" },
			{ tripId: null, startPeriod: "2026-01", endPeriod: "2026-01" },
		]);

		const ranges = await fetchTripPeriodRanges("user-1");

		expect(ranges).toEqual({
			lisboa: { startPeriod: "2026-03", endPeriod: "2026-12" },
		});
		const query = new PgDialect().sqlToQuery(whereMock.mock.calls[0][0]);
		expect(query.sql).toMatch(/"user_id" = \$1/);
		expect(query.sql).toMatch(/"viagem_id" is not null/);
		expect(query.params).toEqual(["user-1"]);
	});
});
