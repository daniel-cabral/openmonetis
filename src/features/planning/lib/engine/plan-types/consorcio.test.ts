import { describe, expect, it } from "vitest";
import type { BidPoint, ConsorcioFields, EnginePlan } from "../types";
import {
	bidPctRange,
	consorcioOwnCash,
	consorcioTotalBid,
	expandConsorcioEvents,
	postBidInstallment,
} from "./consorcio";
import type { ExpandContext } from "./context";

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
			consorcioOwnCash(
				fields({ bidBase }),
				{ min: 32, base: 38, max: 38 },
				1_000_000,
			),
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

describe("consorcioTotalBid", () => {
	it("includes the embedded part", () => {
		const input = fields({
			marginPp: 0,
			embeddedBid: { enabled: true, pct: 10 },
		});
		const pct = { min: 30, base: 30, max: 30 };
		expect(consorcioTotalBid(input, pct, 10_000_000)).toEqual({
			min: 3_000_000,
			base: 3_000_000,
			max: 3_000_000,
		});
		expect(consorcioOwnCash(input, pct, 10_000_000).base).toBe(2_000_000);
	});
});

describe("postBidInstallment", () => {
	it.each([
		[
			200_000,
			21,
			3_000_000,
			"reduce-installment",
			{ amount: 57_143, months: 21 },
		],
		[200_000, 21, 3_000_000, "reduce-term", { amount: 200_000, months: 6 }],
		[200_000, 21, 5_000_000, "reduce-installment", { amount: 0, months: 0 }],
		[200_000, 21, 5_000_000, "reduce-term", { amount: 0, months: 0 }],
	] as const)("installment %i over %i months with bid %i (%s)", (installment, monthsLeft, bid, mode, expected) => {
		expect(postBidInstallment(installment, monthsLeft, bid, mode)).toEqual(
			expected,
		);
	});
});

const ctx: ExpandContext = {
	start: "2027-01",
	end: "2029-01",
	indexForecastPct: { IPCA: 0, INCC: 10 },
	stress: {},
};

function consorcioPlan(
	over: Partial<Omit<EnginePlan, "fields">>,
): EnginePlan & { fields: ConsorcioFields } {
	return {
		id: "c",
		name: "c",
		priority: 1,
		nonNegotiable: true,
		lifecycle: "active",
		basis: "today",
		index: "INCC",
		targetMonth: "2028-01",
		window: null,
		potAccountIds: [],
		fields: fields({}),
		events: [],
		bidHistory: history,
		mappedMonthlyOutflow: 0,
		...over,
	};
}

describe("expandConsorcioEvents", () => {
	it("expands the bid at the target month with the INCC-inflated letter", () => {
		expect(expandConsorcioEvents(consorcioPlan({}), ctx)).toEqual([
			{
				planId: "c",
				month: "2028-01",
				direction: "outflow",
				amount: { min: 352_000, base: 418_000, max: 418_000 },
				label: "c",
			},
		]);
	});

	it("bids at the range max under the bidAtRangeMax stress", () => {
		expect(
			expandConsorcioEvents(consorcioPlan({}), {
				...ctx,
				stress: { bidAtRangeMax: true },
			}),
		).toEqual([
			{
				planId: "c",
				month: "2028-01",
				direction: "outflow",
				amount: { min: 418_000, base: 418_000, max: 418_000 },
				label: "c",
			},
		]);
	});

	it("still projects mapped installments without bid history", () => {
		const events = expandConsorcioEvents(
			consorcioPlan({ bidHistory: [], mappedMonthlyOutflow: 5_000 }),
			{ ...ctx, end: "2027-03" },
		);
		expect(events).toEqual(
			["2027-01", "2027-02", "2027-03"].map((month) => ({
				planId: "c",
				month,
				direction: "outflow",
				amount: { min: 5_000, base: 5_000, max: 5_000 },
				label: "mapped",
			})),
		);
	});
});
