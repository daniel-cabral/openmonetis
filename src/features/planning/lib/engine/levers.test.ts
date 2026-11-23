import { describe, expect, it } from "vitest";
import { type Lever, LeverError, applyLever, simulateLever } from "./levers";
import { engineInput, goalPlan, position } from "./test-fixtures";
import type { Cents, EngineInput, EnginePlan, UnfundedAt } from "./types";

const flat = (amount: Cents) => ({ min: amount, base: amount, max: amount });

// Same setup as the waterfall tests in project.test.ts: C is 50_000 short in 2027-02.
const waterfallInput = (overrideC: Partial<EnginePlan> = {}): EngineInput =>
	engineInput({
		positions: [
			position({ id: "cash", accountId: "cash", amount: 300_000 }),
			position({ id: "pot", accountId: "P", amount: 50_000 }),
		],
		potAccountIds: ["P"],
		incomeBaseline: 10_000,
		costOfLiving: 10_000,
		reserveMonths: 3,
		plans: [
			goalPlan("A", "2027-02", flat(200_000), { priority: 1 }),
			goalPlan("B", "2027-02", flat(100_000), { priority: 2, potAccountIds: ["P"] }),
			goalPlan("C", "2027-02", flat(50_000), { priority: 3, ...overrideC }),
		],
	});

describe("simulateLever", () => {
	it.each<[Lever, Cents, number, UnfundedAt | null]>([
		[{ kind: "contribution", deltaMonthly: 30_000 }, 0, 100, null],
		[{ kind: "cut", monthlyAmount: 5_000, categoryIds: ["dining"] }, 50_000, 0, { month: "2027-02", planId: "C" }],
	])("covers C's shortfall per lever %j (claims are all-or-nothing)", (lever, shortfallAfter, coveredPct, firstUnfundedAfter) => {
		const result = simulateLever(waterfallInput(), lever);

		expect(result.coverage).toEqual([{ planId: "C", shortfallBefore: 50_000, shortfallAfter, coveredPct }]);
		expect(result.firstUnfundedAfter).toEqual(firstUnfundedAfter);
	});

	it("moves a pot to another plan and shows the cost to the donor", () => {
		const result = simulateLever(waterfallInput(), { kind: "redirect-pot", accountId: "P", toPlanId: "C" });

		expect(result.coverage).toEqual([
			{ planId: "C", shortfallBefore: 50_000, shortfallAfter: 0, coveredPct: 100 },
			{ planId: "B", shortfallBefore: 0, shortfallAfter: 100_000, coveredPct: 0 },
		]);
	});
});

describe("applyLever", () => {
	it.each([
		["outside the window", waterfallInput({ window: { earliest: "2027-02", latest: "2027-06" } }), "2027-08"],
		["on a plan without a window", waterfallInput(), "2027-03"],
	])("rejects a shift %s and leaves the input untouched", (_case, input, month) => {
		const snapshot = structuredClone(input);

		expect(() => applyLever(input, { kind: "shift-plan", planId: "C", month })).toThrow(LeverError);
		expect(input).toEqual(snapshot);
	});

	it("moves the target month to a boundary of the window", () => {
		const input = waterfallInput({ window: { earliest: "2027-02", latest: "2027-06" } });

		const shifted = applyLever(input, { kind: "shift-plan", planId: "C", month: "2027-06" });

		expect(shifted.plans.find((plan) => plan.id === "C")?.targetMonth).toBe("2027-06");
	});
});
