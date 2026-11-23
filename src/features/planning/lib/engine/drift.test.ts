import { describe, expect, it } from "vitest";
import { type DriftInput, detectDrift } from "./drift";

const drift = (over: Partial<DriftInput>): DriftInput => ({
	health: {},
	liquidNow: 0,
	reserveFloor: 0,
	contributionsByMonth: [],
	plannedContribution: 0,
	...over,
});

describe("detectDrift", () => {
	it("reports at-risk and off-track plans, reserve shortfall and two consecutive low contribution months", () => {
		const signals = detectDrift(
			drift({
				health: { a: "on-track", b: "at-risk", c: "off-track" },
				liquidNow: 100_000,
				reserveFloor: 120_000,
				contributionsByMonth: [
					{ month: "2027-01", amount: 4_000 },
					{ month: "2027-02", amount: 3_000 },
				],
				plannedContribution: 5_000,
			}),
		);

		expect(signals).toEqual([
			{ kind: "plan-at-risk", planId: "b" },
			{ kind: "plan-off-track", planId: "c" },
			{ kind: "reserve-below-floor", shortfall: 20_000 },
			{ kind: "contribution-below-plan", months: ["2027-01", "2027-02"] },
		]);
	});

	it("does not flag contributions when only the last of two months is below plan", () => {
		const signals = detectDrift(
			drift({
				liquidNow: 200_000,
				reserveFloor: 120_000,
				contributionsByMonth: [
					{ month: "2027-01", amount: 6_000 },
					{ month: "2027-02", amount: 3_000 },
				],
				plannedContribution: 5_000,
			}),
		);

		expect(signals).toEqual([]);
	});

	it("reports no contribution drift when no contribution is planned", () => {
		const signals = detectDrift(
			drift({
				contributionsByMonth: [
					{ month: "2027-01", amount: -1_000 },
					{ month: "2027-02", amount: -2_000 },
				],
				plannedContribution: 0,
			}),
		);

		expect(signals).toEqual([]);
	});
});
