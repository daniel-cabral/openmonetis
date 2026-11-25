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

	describe("with a monthly installment", () => {
		const installmentCtx: ExpandContext = {
			start: "2027-01",
			end: "2028-12",
			indexForecastPct: { IPCA: 0, INCC: 0 },
			stress: {},
		};
		const installmentPlan = (
			over: Partial<ConsorcioFields> = {},
			plan: Partial<Omit<EnginePlan, "fields">> = {},
		) => ({
			...consorcioPlan({
				basis: "nominal",
				targetMonth: "2027-03",
				mappedMonthlyOutflow: 99_999,
				bidHistory: [{ month: "2027-02", winningBidPct: 30 }],
				...plan,
			}),
			fields: fields({
				letterValue: 10_000_000,
				bidBase: "letter",
				marginPp: 0,
				monthlyInstallment: 200_000,
				lastInstallmentMonth: "2028-12",
				...over,
			}),
		});
		const installments = (events: ReturnType<typeof expandConsorcioEvents>) =>
			events.filter((event) => event.label === "installment");

		it.each([
			["embedded off", { enabled: false, pct: 0 }, 3_000_000],
			["embedded on 10%", { enabled: true, pct: 10 }, 2_000_000],
		])("replaces the mapped line with installments and reduces the installment after the bid (%s)", (_label, embeddedBid, bidAmount) => {
			const events = expandConsorcioEvents(
				installmentPlan({ embeddedBid }),
				installmentCtx,
			);
			expect(events.some((event) => event.label === "mapped")).toBe(false);
			const bid = events.filter((event) => event.label === "c");
			expect(bid).toHaveLength(1);
			expect(bid[0]?.month).toBe("2027-03");
			expect(bid[0]?.amount.base).toBe(bidAmount);

			const all = installments(events);
			const before = all.filter((event) => event.month <= "2027-03");
			const after = all.filter((event) => event.month > "2027-03");
			expect(before.map((event) => event.month)).toEqual([
				"2027-01",
				"2027-02",
				"2027-03",
			]);
			for (const event of before) {
				expect(event.amount).toEqual({
					min: 200_000,
					base: 200_000,
					max: 200_000,
				});
			}
			expect(after).toHaveLength(21);
			expect(after[0]?.month).toBe("2027-04");
			expect(after[20]?.month).toBe("2028-12");
			for (const event of after) {
				expect(event.amount).toEqual({
					min: 57_143,
					base: 57_143,
					max: 57_143,
				});
			}
		});

		it("reduce-term keeps the installment for fewer months", () => {
			const after = installments(
				expandConsorcioEvents(
					installmentPlan({ postBidMode: "reduce-term" }),
					installmentCtx,
				),
			).filter((event) => event.month > "2027-03");
			expect(after.map((event) => event.month)).toEqual([
				"2027-04",
				"2027-05",
				"2027-06",
				"2027-07",
				"2027-08",
				"2027-09",
			]);
			for (const event of after) {
				expect(event.amount.base).toBe(200_000);
			}
		});

		it("corrects the installment by the plan index", () => {
			const events = expandConsorcioEvents(installmentPlan(), {
				...installmentCtx,
				indexForecastPct: { IPCA: 0, INCC: 12 },
			});
			const february = installments(events).find(
				(event) => event.month === "2027-02",
			);
			expect(february?.amount.base).toBe(201_898);
		});

		it("without bid history the installment runs unchanged to the last month", () => {
			const events = expandConsorcioEvents(
				installmentPlan({}, { bidHistory: [] }),
				installmentCtx,
			);
			expect(events).toHaveLength(24);
			expect(events.every((event) => event.label === "installment")).toBe(true);
			expect(events.every((event) => event.amount.base === 200_000)).toBe(true);
		});

		it("emits no post-bid events when the bid covers the balance", () => {
			const events = expandConsorcioEvents(
				installmentPlan({ letterValue: 20_000_000 }),
				installmentCtx,
			);
			expect(
				installments(events).filter((event) => event.month > "2027-03"),
			).toEqual([]);
		});

		it("falls back to the mapped line when the installment is null", () => {
			const events = expandConsorcioEvents(
				installmentPlan({ monthlyInstallment: null }),
				installmentCtx,
			);
			expect(events.filter((event) => event.label === "mapped")).toHaveLength(
				24,
			);
			expect(installments(events)).toEqual([]);
		});
	});
});
