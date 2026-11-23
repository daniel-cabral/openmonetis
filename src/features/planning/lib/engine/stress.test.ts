import { describe, expect, it } from "vitest";
import { applyStress, stressEffects } from "./stress";
import { engineInput, goalPlan, position } from "./test-fixtures";

const cashFlowInput = () =>
	engineInput({
		positions: [position({ id: "cash", amount: 100_000 })],
		incomeBaseline: 50_000,
		costOfLiving: 40_000,
		irregularExpenses: [{ calendarMonth: 3, amount: 30_000, label: "IPVA" }],
		reserveMonths: 3,
	});

describe("stressEffects", () => {
	it("reports the base slack delta of each defined toggle, run alone, in toggle order", () => {
		const effects = stressEffects(cashFlowInput(), {
			incomeLossMonths: 2,
			contributionCap: 5_000,
		});

		expect(
			effects.map(({ toggle, minSlackDelta }) => [toggle, minSlackDelta]),
		).toEqual([
			["contributionCap", -15_000],
			["incomeLossMonths", -100_000],
		]);
	});

	it("reports the first unfunded month before and after a toggle", () => {
		const input = engineInput({
			positions: [position({ id: "cash", amount: 100_000 })],
			incomeBaseline: 50_000,
			costOfLiving: 40_000,
			irregularExpenses: [{ calendarMonth: 3, amount: 30_000, label: "IPVA" }],
			reserveMonths: 1,
			plans: [
				goalPlan("P", "2027-03", { min: 50_000, base: 50_000, max: 50_000 }),
			],
		});

		const [effect] = stressEffects(input, { contributionCap: 5_000 });

		expect(effect.firstUnfundedBefore).toBeNull();
		expect(effect.firstUnfundedAfter).toEqual({
			month: "2027-03",
			planId: "P",
		});
	});
});

describe("applyStress", () => {
	it("merges toggles into a new input and never mutates the argument", () => {
		const input = engineInput({ stress: { incomeLossMonths: 1 } });

		const stressed = applyStress(input, { contributionCap: 5_000 });

		expect(stressed.stress).toEqual({
			incomeLossMonths: 1,
			contributionCap: 5_000,
		});
		expect(input.stress).toEqual({ incomeLossMonths: 1 });
	});
});
