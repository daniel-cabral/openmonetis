import { comparePeriods } from "@/shared/utils/period";
import { runProjection } from "./projection";
import type { Cents, EngineInput, Period, UnfundedAt } from "./types";

export type Lever =
	| { kind: "cut"; monthlyAmount: Cents; categoryIds: string[] }
	| { kind: "redirect-pot"; accountId: string; toPlanId: string }
	| { kind: "contribution"; deltaMonthly: Cents }
	| { kind: "shift-plan"; planId: string; month: Period };

export class LeverError extends Error {}

export type LeverCoverage = {
	planId: string;
	shortfallBefore: Cents;
	shortfallAfter: Cents;
	coveredPct: number;
};

export type LeverResult = {
	lever: Lever;
	firstUnfundedBefore: UnfundedAt | null;
	firstUnfundedAfter: UnfundedAt | null;
	coverage: LeverCoverage[];
};

export function applyLever(input: EngineInput, lever: Lever): EngineInput {
	switch (lever.kind) {
		case "cut":
			return {
				...input,
				extraMonthlySaving: input.extraMonthlySaving + lever.monthlyAmount,
			};
		case "contribution":
			return {
				...input,
				extraMonthlySaving: input.extraMonthlySaving + lever.deltaMonthly,
			};
		case "redirect-pot":
			return {
				...input,
				plans: input.plans.map((plan) => ({
					...plan,
					potAccountIds: [
						...plan.potAccountIds.filter(
							(accountId) => accountId !== lever.accountId,
						),
						...(plan.id === lever.toPlanId ? [lever.accountId] : []),
					],
				})),
			};
		case "shift-plan": {
			const bounds = input.plans.find(
				(plan) => plan.id === lever.planId,
			)?.window;
			if (
				!bounds ||
				comparePeriods(lever.month, bounds.earliest) < 0 ||
				comparePeriods(lever.month, bounds.latest) > 0
			) {
				throw new LeverError(
					`${lever.month} is outside the window of plan ${lever.planId}`,
				);
			}
			return {
				...input,
				plans: input.plans.map((plan) =>
					plan.id === lever.planId
						? { ...plan, targetMonth: lever.month }
						: plan,
				),
			};
		}
	}
}

export function simulateLever(input: EngineInput, lever: Lever): LeverResult {
	const before = runProjection(input).scenarios.base;
	const after = runProjection(applyLever(input, lever)).scenarios.base;
	const planIds = [
		...new Set([
			...Object.keys(before.shortfallByPlan),
			...Object.keys(after.shortfallByPlan),
		]),
	];

	return {
		lever,
		firstUnfundedBefore: before.firstUnfunded,
		firstUnfundedAfter: after.firstUnfunded,
		coverage: planIds.map((planId) => {
			const shortfallBefore = before.shortfallByPlan[planId] ?? 0;
			const shortfallAfter = after.shortfallByPlan[planId] ?? 0;
			return {
				planId,
				shortfallBefore,
				shortfallAfter,
				coveredPct:
					shortfallBefore === 0
						? 0
						: Math.round(
								(100 * (shortfallBefore - shortfallAfter)) / shortfallBefore,
							),
			};
		}),
	};
}
