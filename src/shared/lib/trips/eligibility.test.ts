import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { isTripEligible, tripEligibleCondition } from "./eligibility";
import { findTripForDate } from "./find-trip-for-date";
import type { TripOption } from "./types";

const lisboa: TripOption = {
	id: "trip-lisboa",
	name: "Lisboa",
	startDate: "2026-05-12",
	endDate: "2026-05-22",
};
const santiago: TripOption = {
	id: "trip-santiago",
	name: "Santiago",
	startDate: "2026-09-01",
	endDate: "2026-09-01",
};

describe("findTripForDate", () => {
	it.each([
		["2026-05-14", "trip-lisboa"],
		["2026-05-12", "trip-lisboa"],
		["2026-05-22", "trip-lisboa"],
		["2026-09-01", "trip-santiago"],
		["2026-05-11", undefined],
		["2026-05-23", undefined],
		["", undefined],
		["14/05/2026", undefined],
	])("data %s cai na viagem %s", (date, expected) => {
		expect(findTripForDate([lisboa, santiago], date)?.id).toBe(expected);
	});
});

describe("isTripEligible", () => {
	it.each([
		[{ transactionType: "Despesa", note: null }, true],
		[{ transactionType: "Receita", note: "reembolso" }, true],
		[{ transactionType: "Transferência", note: null }, false],
		[{ transactionType: "Despesa", note: "AUTO_FATURA:card:2026-06" }, false],
		[{ transactionType: "Receita", note: "AUTO_FATURA:card:2026-06:ab12" }, false],
	])("%o -> %s", (row, expected) => {
		expect(isTripEligible(row)).toBe(expected);
	});
});

describe("tripEligibleCondition", () => {
	it("exclui transferências e AUTO_FATURA sem descartar nota nula", () => {
		const query = new PgDialect().sqlToQuery(tripEligibleCondition());
		expect(query.sql).toContain('"transfer_id" is null');
		expect(query.sql).toContain('"tipo_transacao" <>');
		expect(query.sql).toContain('"anotacao" is null');
		expect(query.sql).toContain('"anotacao" not like');
		expect(query.params).toEqual(
			expect.arrayContaining(["Transferência", "AUTO_FATURA:%"]),
		);
	});
});
