import type {
	Cents,
	EnginePlan,
	PlanHealth,
	Period,
	Projection,
	ScenarioResult,
} from "@/features/planning/lib/engine";

type ModelScenario = "base" | "pessimistic";

export type ProjectionSummary = {
	horizonEnd: Period;
	firstUnfunded: Record<
		ModelScenario,
		{ month: Period; planName: string } | null
	>;
	minSlack: Record<ModelScenario, Cents>;
	plans: { id: string; name: string; health: PlanHealth; shortfallBase: Cents }[];
};

export type ProposalDiff = {
	healthChanges: { name: string; from: PlanHealth | null; to: PlanHealth }[];
	firstUnfundedBase: { from: Period | null; to: Period | null };
	minSlackBaseDelta: Cents;
};

export function summarizeProjection(
	projection: Projection,
	plans: Pick<EnginePlan, "id" | "name">[],
): ProjectionSummary {
	const nameOf = (planId: string) =>
		plans.find((plan) => plan.id === planId)?.name ?? planId;
	const byScenario = <T>(pick: (result: ScenarioResult) => T) => ({
		base: pick(projection.scenarios.base),
		pessimistic: pick(projection.scenarios.pessimistic),
	});

	return {
		horizonEnd: projection.end,
		firstUnfunded: byScenario((result) =>
			result.firstUnfunded
				? {
						month: result.firstUnfunded.month,
						planName: nameOf(result.firstUnfunded.planId),
					}
				: null,
		),
		minSlack: byScenario((result) =>
			Math.min(...result.months.map((row) => row.slack)),
		),
		plans: plans.flatMap((plan) => {
			const health = projection.health[plan.id];
			return health
				? [
						{
							id: plan.id,
							name: plan.name,
							health,
							shortfallBase:
								projection.scenarios.base.shortfallByPlan[plan.id] ?? 0,
						},
					]
				: [];
		}),
	};
}

export function diffSummaries(
	before: ProjectionSummary,
	after: ProjectionSummary,
): ProposalDiff {
	return {
		healthChanges: after.plans.flatMap((plan) => {
			const from =
				before.plans.find((candidate) => candidate.id === plan.id)?.health ??
				null;
			return from === plan.health
				? []
				: [{ name: plan.name, from, to: plan.health }];
		}),
		firstUnfundedBase: {
			from: before.firstUnfunded.base?.month ?? null,
			to: after.firstUnfunded.base?.month ?? null,
		},
		minSlackBaseDelta: after.minSlack.base - before.minSlack.base,
	};
}
