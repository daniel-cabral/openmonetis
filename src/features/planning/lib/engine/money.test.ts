import { describe, expect, it } from "vitest";
import { inflateToMonth, pickAmount, scaleRange } from "./money";

describe("pickAmount", () => {
	it.each([
		["outflow", "pessimistic", 130],
		["outflow", "base", 100],
		["outflow", "optimistic", 80],
		["inflow", "pessimistic", 80],
		["inflow", "optimistic", 130],
	] as const)("picks the %s amount for the %s scenario", (direction, scenario, expected) => {
		expect(pickAmount({ min: 80, base: 100, max: 130 }, direction, scenario)).toBe(expected);
	});
});

describe("inflateToMonth", () => {
	it("compounds the annual index monthly and never deflates", () => {
		expect(inflateToMonth(100_000, 12, "2027-01", "2028-01")).toBe(112_000);
		expect(inflateToMonth(100_000, 12, "2027-01", "2027-07")).toBe(105_830);
		expect(inflateToMonth(100_000, 12, "2027-01", "2026-06")).toBe(100_000);
	});
});

describe("scaleRange", () => {
	it("scales every end and rounds to whole centavos", () => {
		expect(scaleRange({ min: 10_001, base: 20_000, max: 30_000 }, 1.1)).toEqual({
			min: 11_001,
			base: 22_000,
			max: 33_000,
		});
	});
});
