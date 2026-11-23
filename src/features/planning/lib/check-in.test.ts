import { describe, expect, it } from "vitest";
import type { ContributionRow, PositionView } from "@/features/planning/lib/snapshot-types";
import {
	type ContributionAssignment,
	defaultAssignment,
	prefillPositionLines,
} from "./check-in";

const position = (over: Partial<PositionView>): PositionView => ({
	id: "position",
	description: "Posicao",
	amount: 0,
	liquidity: "daily",
	maturityMonth: null,
	annualRealReturnPct: null,
	asOf: "2026-11-01",
	...over,
});

const contribution = (id: string, date: string, amount: number): ContributionRow => ({
	id,
	name: "Aporte",
	date,
	amount,
});

describe("prefillPositionLines", () => {
	it("adds this account's assignments to matching buckets and appends new ones", () => {
		const current = [
			position({ description: "Liquidez", amount: 100_000, liquidity: "daily" }),
			position({
				description: "Tesouro 2028",
				amount: 50_000,
				liquidity: "maturity",
				maturityMonth: "2028-05",
			}),
		];
		const assignments: ContributionAssignment[] = [
			defaultAssignment(contribution("c1", "2026-11-03", 10_000), "acc-1"),
			{
				...defaultAssignment(contribution("c2", "2026-11-05", 5_000), "acc-1"),
				liquidity: "maturity",
				maturityMonth: "2028-05",
			},
			{
				...defaultAssignment(contribution("c3", "2026-11-10", 7_000), "acc-1"),
				liquidity: "maturity",
				maturityMonth: "2029-01",
			},
			{
				...defaultAssignment(contribution("c4", "2026-11-12", 99_000), "acc-2"),
				liquidity: "maturity",
				maturityMonth: "2028-05",
			},
		];

		expect(prefillPositionLines(current, assignments, "acc-1")).toEqual([
			{
				description: "Liquidez",
				amount: 110_000,
				liquidity: "daily",
				maturityMonth: null,
				annualRealReturnPct: null,
			},
			{
				description: "Tesouro 2028",
				amount: 55_000,
				liquidity: "maturity",
				maturityMonth: "2028-05",
				annualRealReturnPct: null,
			},
			{
				description: "Aporte 10/11",
				amount: 7_000,
				liquidity: "maturity",
				maturityMonth: "2029-01",
				annualRealReturnPct: null,
			},
		]);
	});
});
