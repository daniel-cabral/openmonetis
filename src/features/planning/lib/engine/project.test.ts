import { describe, expect, it } from "vitest";
import { projectScenario } from "./project";
import { engineInput, position } from "./test-fixtures";
import type { EnginePlan, ExpandedEvent } from "./types";

describe("projectScenario", () => {
	it("accumulates free cash, applies irregular expenses and flags reserve breaches", () => {
		const input = engineInput({
			positions: [position({ id: "cash", amount: 100_000 })],
			incomeBaseline: 50_000,
			costOfLiving: 40_000,
			irregularExpenses: [{ calendarMonth: 3, amount: 30_000, label: "IPVA" }],
			reserveMonths: 3,
		});

		const result = projectScenario(input, "base", [], { start: "2027-01", end: "2027-04" });

		expect(result.months.map((row) => row.liquid)).toEqual([110_000, 120_000, 100_000, 110_000]);
		expect(result.months.map((row) => row.slack)).toEqual([-10_000, 0, -20_000, -10_000]);
		expect(result.months.map((row) => row.reserveBreached)).toEqual([true, false, true, true]);
		expect(result.firstUnfunded).toBeNull();
	});
});

describe("priority waterfall", () => {
	const plan = (id: string, priority: number, potAccountIds: string[] = []): EnginePlan => ({
		id,
		name: id,
		priority,
		nonNegotiable: false,
		lifecycle: "active",
		basis: "nominal",
		index: "IPCA",
		targetMonth: "2027-02",
		window: null,
		potAccountIds,
		fields: { type: "goal", target: { min: 0, base: 0, max: 0 } },
		events: [],
		bidHistory: [],
		mappedMonthlyOutflow: 0,
	});

	const claimAt = (planId: string, amount: number): ExpandedEvent => ({
		planId,
		month: "2027-02",
		direction: "outflow",
		amount: { min: amount, base: amount, max: amount },
		label: planId,
	});

	const waterfallInput = () =>
		engineInput({
			positions: [
				position({ id: "cash", accountId: "cash", amount: 300_000 }),
				position({ id: "pot", accountId: "P", amount: 50_000 }),
			],
			potAccountIds: ["P"],
			incomeBaseline: 10_000,
			costOfLiving: 10_000,
			reserveMonths: 3,
			plans: [plan("A", 1), plan("B", 2, ["P"]), plan("C", 3)],
		});

	const range = { start: "2027-01", end: "2027-02" };

	it("lets the lower-priority plan give way when its claim does not fit", () => {
		const result = projectScenario(
			waterfallInput(),
			"base",
			[claimAt("A", 200_000), claimAt("B", 100_000), claimAt("C", 50_000)],
			range,
		);

		expect(result.firstUnfunded).toEqual({ month: "2027-02", planId: "C" });
		expect(result.shortfallByPlan).toEqual({ C: 50_000 });
		expect(result.months[1].required).toBe(350_000);
		expect(result.months[1].paid).toBe(300_000);
		expect(result.months[1].slack).toBe(20_000);
	});

	it("keeps paying lower priorities after a higher-priority claim fails", () => {
		const result = projectScenario(
			waterfallInput(),
			"base",
			[claimAt("A", 290_000), claimAt("B", 100_000), claimAt("C", 50_000)],
			range,
		);

		expect(result.shortfallByPlan).toEqual({ A: 290_000 });
		expect(result.months[1].unfundedPlanIds).toEqual(["A"]);
	});

	it("does not let a plan spend a pot it does not name", () => {
		const result = projectScenario(waterfallInput(), "base", [claimAt("C", 280_000)], range);

		expect(result.shortfallByPlan).toEqual({ C: 280_000 });
	});
});
