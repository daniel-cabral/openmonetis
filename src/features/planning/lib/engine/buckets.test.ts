import { describe, expect, it } from "vitest";
import { advanceMonth, bucketsTotal, liquidToday, monthlyNominalRate, openBuckets } from "./buckets";
import type { EnginePosition } from "./types";

const position = (over: Partial<EnginePosition>): EnginePosition => ({
	id: "position",
	accountId: "A",
	amount: 0,
	liquidity: "daily",
	maturityMonth: null,
	annualRealReturnPct: 0,
	...over,
});

const positions: EnginePosition[] = [
	position({ id: "daily", amount: 10_000 }),
	position({ id: "matured", amount: 3_000, liquidity: "maturity", maturityMonth: "2026-12" }),
	position({ id: "future", amount: 20_000, liquidity: "maturity", maturityMonth: "2027-03" }),
	position({ id: "locked", amount: 50_000, liquidity: "locked" }),
	position({ id: "pot", accountId: "P", amount: 5_000 }),
];

describe("monthlyNominalRate", () => {
	it("converts the real rate and the index into a monthly rate", () => {
		expect(monthlyNominalRate(2, 10)).toBeCloseTo(0.00964, 4);
		expect(monthlyNominalRate(0, 0)).toBe(0);
	});
});

describe("position buckets", () => {
	it("splits positions by liquidity, releases maturities on their month and keeps the total", () => {
		const open = openBuckets(positions, ["P"], "2027-01", 0);
		expect(open.general).toBe(13_000);
		expect(open.pots).toEqual({ P: 5_000 });
		expect(open.pending).toHaveLength(1);
		expect(open.locked).toBe(50_000);
		expect(liquidToday(positions, ["P"], "2027-01")).toBe(13_000);

		const march = advanceMonth(advanceMonth(open, "2027-02"), "2027-03");
		expect(march.general).toBe(33_000);
		expect(bucketsTotal(march)).toBe(88_000);
	});
});
