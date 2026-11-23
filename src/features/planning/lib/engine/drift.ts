import type { Cents, Period, PlanHealth } from "./types";

export type DriftSignal =
	| { kind: "plan-at-risk"; planId: string }
	| { kind: "plan-off-track"; planId: string }
	| { kind: "reserve-below-floor"; shortfall: Cents }
	| { kind: "contribution-below-plan"; months: Period[] };

export type DriftInput = {
	health: Record<string, PlanHealth>;
	liquidNow: Cents;
	reserveFloor: Cents;
	contributionsByMonth: { month: Period; amount: Cents }[]; // last complete months, ascending
	plannedContribution: Cents;
};

export function detectDrift(input: DriftInput): DriftSignal[] {
	const signals: DriftSignal[] = [];

	for (const [planId, health] of Object.entries(input.health)) {
		if (health === "at-risk") {
			signals.push({ kind: "plan-at-risk", planId });
		}
		if (health === "off-track") {
			signals.push({ kind: "plan-off-track", planId });
		}
	}

	if (input.liquidNow < input.reserveFloor) {
		signals.push({
			kind: "reserve-below-floor",
			shortfall: input.reserveFloor - input.liquidNow,
		});
	}

	const lastTwo = input.contributionsByMonth.slice(-2);
	const belowPlan =
		input.plannedContribution > 0 &&
		lastTwo.length === 2 &&
		lastTwo.every((entry) => entry.amount < input.plannedContribution);
	if (belowPlan) {
		signals.push({
			kind: "contribution-below-plan",
			months: lastTwo.map((entry) => entry.month),
		});
	}

	return signals;
}
