import { describe, expect, it } from "vitest";
import type { BidPoint, ConsorcioFields } from "../types";
import { bidPctRange, consorcioOwnCash } from "./consorcio";

const history = [
	["2026-06", 50],
	["2026-07", 30],
	["2026-08", 32],
	["2026-09", 35],
	["2026-10", 33],
	["2026-11", 34],
	["2026-12", 36],
].map(([month, winningBidPct]) => ({ month, winningBidPct })) as BidPoint[];

function fields(over: Partial<ConsorcioFields>): ConsorcioFields {
	return {
		type: "consorcio",
		letterValue: 1_000_000,
		outstandingBalance: 800_000,
		bidBase: "letter",
		marginPp: 2,
		embeddedBid: { enabled: false, pct: 0 },
		...over,
	};
}

describe("bidPctRange", () => {
	it("builds the bid range from the last six months plus margin", () => {
		expect(bidPctRange(history, 2)).toEqual({ min: 32, base: 38, max: 38 });
		expect(bidPctRange([], 2)).toBeNull();
	});
});

describe("consorcioOwnCash", () => {
	it.each([
		["letter", { min: 320_000, base: 380_000, max: 380_000 }],
		["outstanding", { min: 256_000, base: 304_000, max: 304_000 }],
		["both", { min: 256_000, base: 380_000, max: 380_000 }],
	] as const)("applies the bid to the %s base", (bidBase, expected) => {
		expect(
			consorcioOwnCash(fields({ bidBase }), { min: 32, base: 38, max: 38 }, 1_000_000),
		).toEqual(expected);
	});

	it("subtracts the embedded bid from each end and floors at zero", () => {
		expect(
			consorcioOwnCash(
				fields({ embeddedBid: { enabled: true, pct: 25 } }),
				{ min: 32, base: 38, max: 38 },
				1_000_000,
			),
		).toEqual({ min: 70_000, base: 130_000, max: 130_000 });
		expect(
			consorcioOwnCash(
				fields({ embeddedBid: { enabled: true, pct: 30 } }),
				{ min: 20, base: 25, max: 40 },
				1_000_000,
			),
		).toEqual({ min: 0, base: 0, max: 100_000 });
	});
});
