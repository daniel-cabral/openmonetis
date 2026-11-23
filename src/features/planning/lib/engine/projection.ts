import { resolveHorizon } from "./horizon";
import { expandPlanEvents } from "./plan-types";
import type { ExpandContext } from "./plan-types/context";
import { projectScenario } from "./project";
import {
	type EngineInput,
	type PlanHealth,
	type Projection,
	SCENARIOS,
	type Scenario,
	type ScenarioResult,
} from "./types";

export function planHealth(
	results: Record<Scenario, ScenarioResult>,
	planIds: string[],
): Record<string, PlanHealth> {
	const funded = (scenario: Scenario, planId: string) => (results[scenario].shortfallByPlan[planId] ?? 0) === 0;

	return Object.fromEntries(
		planIds.map((planId) => {
			if (!funded("base", planId)) {
				return [planId, "off-track"];
			}
			return [planId, funded("pessimistic", planId) ? "on-track" : "at-risk"];
		}),
	);
}

export function runProjection(input: EngineInput): Projection {
	const { start, end } = resolveHorizon(input);
	const ctx: ExpandContext = {
		start,
		end,
		indexForecastPct: input.indexForecastPct,
		stress: input.stress,
	};
	const events = input.plans.flatMap((plan) => expandPlanEvents(plan, ctx));

	const scenarios = {} as Record<Scenario, ScenarioResult>;
	for (const scenario of SCENARIOS) {
		scenarios[scenario] = projectScenario(input, scenario, events, { start, end });
	}

	const activePlanIds = input.plans.filter((plan) => plan.lifecycle === "active").map((plan) => plan.id);
	return { start, end, scenarios, health: planHealth(scenarios, activePlanIds) };
}
