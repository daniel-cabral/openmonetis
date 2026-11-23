import { runProjection } from "./projection";
import type { Cents, EngineInput, ScenarioResult, StressToggles, UnfundedAt } from "./types";

const TOGGLE_ORDER: (keyof StressToggles)[] = ["contributionCap", "incomeLossMonths", "bidAtRangeMax", "planCostPct"];

export type StressEffect = {
	toggle: keyof StressToggles;
	minSlackDelta: Cents;
	firstUnfundedBefore: UnfundedAt | null;
	firstUnfundedAfter: UnfundedAt | null;
};

export function applyStress(input: EngineInput, toggles: StressToggles): EngineInput {
	return { ...input, stress: { ...input.stress, ...toggles } };
}

function minSlack(result: ScenarioResult): Cents {
	return Math.min(...result.months.map((row) => row.slack));
}

export function stressEffects(input: EngineInput, toggles: StressToggles): StressEffect[] {
	const unstressed: EngineInput = { ...input, stress: {} };
	const before = runProjection(unstressed).scenarios.base;

	return TOGGLE_ORDER.filter((toggle) => toggles[toggle] !== undefined).map((toggle) => {
		const alone = { [toggle]: toggles[toggle] } as StressToggles;
		const after = runProjection(applyStress(unstressed, alone)).scenarios.base;

		return {
			toggle,
			minSlackDelta: minSlack(after) - minSlack(before),
			firstUnfundedBefore: before.firstUnfunded,
			firstUnfundedAfter: after.firstUnfunded,
		};
	});
}
