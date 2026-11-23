import type {
	Cents,
	Lever,
	LeverCoverage,
	LeverResult,
	Period,
	PlanHealth,
	UnfundedAt,
} from "@/features/planning/lib/engine";
import { formatCurrency } from "@/shared/utils/currency";
import type { ProjectionSummary, ProposalDiff } from "./summary";

export function formatCentsForLlm(value: Cents): string {
	return formatCurrency(value / 100);
}

export type LlmProjectionSummary = {
	horizonEnd: Period;
	firstUnfunded: ProjectionSummary["firstUnfunded"];
	minSlack: Record<"base" | "pessimistic", string>;
	plans: {
		id: string;
		name: string;
		health: PlanHealth;
		shortfallBase: string;
	}[];
};

export type LlmProposalDiff = Omit<ProposalDiff, "minSlackBaseDelta"> & {
	minSlackBaseDelta: string;
};

export type LlmLeverResult = {
	lever:
		| { kind: "cut"; monthlyAmount: string; categoryIds: string[] }
		| { kind: "redirect-pot"; accountId: string; toPlanId: string }
		| { kind: "contribution"; deltaMonthly: string }
		| { kind: "shift-plan"; planId: string; month: Period };
	firstUnfundedBefore: UnfundedAt | null;
	firstUnfundedAfter: UnfundedAt | null;
	coverage: (Omit<LeverCoverage, "shortfallBefore" | "shortfallAfter"> & {
		shortfallBefore: string;
		shortfallAfter: string;
	})[];
};

export function toLlmSummary(summary: ProjectionSummary): LlmProjectionSummary {
	return {
		horizonEnd: summary.horizonEnd,
		firstUnfunded: summary.firstUnfunded,
		minSlack: {
			base: formatCentsForLlm(summary.minSlack.base),
			pessimistic: formatCentsForLlm(summary.minSlack.pessimistic),
		},
		plans: summary.plans.map((plan) => ({
			...plan,
			shortfallBase: formatCentsForLlm(plan.shortfallBase),
		})),
	};
}

export function toLlmDiff(diff: ProposalDiff): LlmProposalDiff {
	return {
		...diff,
		minSlackBaseDelta: formatCentsForLlm(diff.minSlackBaseDelta),
	};
}

export function toLlmLeverResult(result: LeverResult): LlmLeverResult {
	return {
		lever: toLlmLever(result.lever),
		firstUnfundedBefore: result.firstUnfundedBefore,
		firstUnfundedAfter: result.firstUnfundedAfter,
		coverage: result.coverage.map((coverage) => ({
			...coverage,
			shortfallBefore: formatCentsForLlm(coverage.shortfallBefore),
			shortfallAfter: formatCentsForLlm(coverage.shortfallAfter),
		})),
	};
}

function toLlmLever(lever: Lever): LlmLeverResult["lever"] {
	switch (lever.kind) {
		case "cut":
			return { ...lever, monthlyAmount: formatCentsForLlm(lever.monthlyAmount) };
		case "contribution":
			return { ...lever, deltaMonthly: formatCentsForLlm(lever.deltaMonthly) };
		case "redirect-pot":
		case "shift-plan":
			return lever;
	}
}
