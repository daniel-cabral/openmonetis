import type {
	Cents,
	LiquidityKind,
	Period,
	PlanHealth,
	Projection,
} from "@/features/planning/lib/engine";
import type { PlanningSnapshot } from "@/features/planning/lib/snapshot-types";
import {
	formatCentsForLlm,
	type LlmProjectionSummary,
	toLlmSummary,
} from "./llm-format";
import { summarizeProjection } from "./summary";

const MAX_ASSUMPTIONS = 20;

export type LlmMoney = string;

export type PlannerContext = {
	today: Period;
	cashFlow: {
		incomeBaseline: LlmMoney;
		costOfLiving: LlmMoney;
		plannedContribution: LlmMoney;
		contributionsByMonth: { month: Period; amount: LlmMoney }[];
	};
	patrimony: {
		total: LlmMoney;
		daily: LlmMoney;
		maturities: { month: Period; amount: LlmMoney }[];
		locked: LlmMoney;
		pots: { accountName: string; amount: LlmMoney }[];
	};
	reserve: { months: number; floor: LlmMoney };
	plans: {
		id: string;
		name: string;
		type: string;
		priority: number;
		nonNegotiable: boolean;
		targetMonth: Period;
		window: { earliest: Period; latest: Period } | null;
		health: PlanHealth | null;
	}[];
	projection: LlmProjectionSummary;
	latestBids: { planName: string; month: Period; winningBidPct: number }[];
	assumptions: {
		date: string;
		kind: string;
		summary: string;
		source: string;
	}[];
};

const sumCents = (values: Cents[]): Cents =>
	values.reduce((total, value) => total + value, 0);

export function buildPlannerContext(
	snapshot: PlanningSnapshot,
	projection: Projection,
): PlannerContext {
	const { input, settings } = snapshot;
	const sumLiquidity = (liquidity: LiquidityKind) =>
		sumCents(
			input.positions
				.filter((position) => position.liquidity === liquidity)
				.map((position) => position.amount),
		);
	const maturityByMonth = new Map<Period, Cents>();
	for (const position of input.positions) {
		if (position.liquidity === "maturity" && position.maturityMonth) {
			maturityByMonth.set(
				position.maturityMonth,
				(maturityByMonth.get(position.maturityMonth) ?? 0) + position.amount,
			);
		}
	}

	return {
		today: snapshot.currentMonth,
		cashFlow: {
			incomeBaseline: formatCentsForLlm(input.incomeBaseline),
			costOfLiving: formatCentsForLlm(input.costOfLiving),
			plannedContribution: formatCentsForLlm(settings.plannedContribution),
			contributionsByMonth: snapshot.contributionsByMonth.map(
				({ month, amount }) => ({ month, amount: formatCentsForLlm(amount) }),
			),
		},
		patrimony: {
			total: formatCentsForLlm(sumCents(input.positions.map((p) => p.amount))),
			daily: formatCentsForLlm(sumLiquidity("daily")),
			maturities: [...maturityByMonth]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([month, amount]) => ({
					month,
					amount: formatCentsForLlm(amount),
				})),
			locked: formatCentsForLlm(sumLiquidity("locked")),
			pots: snapshot.accounts
				.filter((account) => account.isEarmarkedPot)
				.map((account) => ({
					accountName: account.name,
					amount: formatCentsForLlm(
						sumCents(account.positions.map((p) => p.amount)),
					),
				})),
		},
		reserve: {
			months: input.reserveMonths,
			floor: formatCentsForLlm(
				projection.scenarios.base.months[0]?.reserveFloor ?? 0,
			),
		},
		plans: snapshot.plans.map((plan) => ({
			id: plan.id,
			name: plan.name,
			type: plan.type,
			priority: plan.priority,
			nonNegotiable: plan.nonNegotiable,
			targetMonth: plan.targetMonth,
			window: plan.window,
			health: projection.health[plan.id] ?? null,
		})),
		projection: toLlmSummary(summarizeProjection(projection, snapshot.plans)),
		latestBids: snapshot.plans.flatMap((plan) => {
			const latest = [...plan.bidHistory].sort((a, b) =>
				b.month.localeCompare(a.month),
			)[0];
			return latest
				? [
						{
							planName: plan.name,
							month: latest.month,
							winningBidPct: latest.winningBidPct,
						},
					]
				: [];
		}),
		assumptions: [...snapshot.assumptions]
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
			.slice(0, MAX_ASSUMPTIONS)
			.map((assumption) => ({
				date: assumption.createdAt.slice(0, 10),
				kind: assumption.kind,
				summary: assumption.summary,
				source: assumption.source,
			})),
	};
}
