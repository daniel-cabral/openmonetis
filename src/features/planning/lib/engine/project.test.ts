import { describe, expect, it } from "vitest";
import { projectScenario } from "./project";
import { engineInput, position } from "./test-fixtures";

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
