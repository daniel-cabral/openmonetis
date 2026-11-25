import type {
	AmountRange,
	Cents,
	LiquidityKind,
	Period,
	PlanHealth,
	PlanTypeFields,
	PriceIndex,
	Projection,
} from "@/features/planning/lib/engine";
import type { PlanningSnapshot } from "@/features/planning/lib/snapshot-types";
import { capUntrusted } from "@/shared/lib/ai/untrusted";
import {
	formatCentsForLlm,
	type LlmProjectionSummary,
	toLlmSummary,
} from "./llm-format";
import { summarizeProjection } from "./summary";

const MAX_ASSUMPTIONS = 20;
const MAX_NAME = 80;
const MAX_SUMMARY = 300;

export type LlmMoney = string;

type LlmRange = { min: LlmMoney; base: LlmMoney; max: LlmMoney };

type LlmPlanFields =
	| { type: "goal"; target: LlmRange }
	| {
			type: "consorcio";
			letterValue: LlmMoney;
			outstandingBalance: LlmMoney;
			bidBase: "letter" | "outstanding" | "both";
			marginPp: number;
			embeddedBid: { enabled: boolean; pct: number };
	  };

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
		positions: {
			id: string;
			accountId: string;
			amount: LlmMoney;
			liquidity: LiquidityKind;
			maturityMonth: Period | null;
			annualRealReturnPct: number | null;
		}[];
		pots: { accountId: string; accountName: string; amount: LlmMoney }[];
		accounts: {
			accountId: string;
			accountName: string;
			asOf: string | null;
			stale: boolean;
		}[];
	};
	indexForecastPct: Record<PriceIndex, number>;
	reserve: { months: number; floor: LlmMoney };
	plans: {
		id: string;
		name: string;
		type: string;
		priority: number;
		nonNegotiable: boolean;
		lifecycle: string;
		basis: string;
		index: string;
		targetMonth: Period;
		window: { earliest: Period; latest: Period } | null;
		potAccountIds: string[];
		fields: LlmPlanFields;
		events: {
			label: string;
			direction: string;
			basis: string;
			amount: LlmRange;
			startMonth: Period;
			endMonth: Period | null;
		}[];
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

const toLlmRange = (range: AmountRange): LlmRange => ({
	min: formatCentsForLlm(range.min),
	base: formatCentsForLlm(range.base),
	max: formatCentsForLlm(range.max),
});

function toLlmFields(fields: PlanTypeFields): LlmPlanFields {
	if (fields.type === "goal") {
		return { type: "goal", target: toLlmRange(fields.target) };
	}
	return {
		...fields,
		letterValue: formatCentsForLlm(fields.letterValue),
		outstandingBalance: formatCentsForLlm(fields.outstandingBalance),
	};
}

const STALE_AFTER_DAYS = 45;
const MS_PER_DAY = 86_400_000;

const sumCents = (values: Cents[]): Cents =>
	values.reduce((total, value) => total + value, 0);

export function buildPlannerContext(
	snapshot: PlanningSnapshot,
	projection: Projection,
	now: Date = new Date(),
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
			positions: input.positions.map((position) => ({
				id: position.id,
				accountId: position.accountId,
				amount: formatCentsForLlm(position.amount),
				liquidity: position.liquidity,
				maturityMonth: position.maturityMonth,
				annualRealReturnPct: position.annualRealReturnPct,
			})),
			pots: snapshot.accounts
				.filter((account) => account.isEarmarkedPot)
				.map((account) => ({
					accountId: account.id,
					accountName: capUntrusted(account.name, MAX_NAME),
					amount: formatCentsForLlm(
						sumCents(account.positions.map((p) => p.amount)),
					),
				})),
			accounts: snapshot.accounts.map((account) => ({
				accountId: account.id,
				accountName: capUntrusted(account.name, MAX_NAME),
				asOf: account.lastAsOf,
				stale:
					account.lastAsOf === null ||
					now.getTime() - new Date(account.lastAsOf).getTime() >
						STALE_AFTER_DAYS * MS_PER_DAY,
			})),
		},
		indexForecastPct: input.indexForecastPct,
		reserve: {
			months: input.reserveMonths,
			floor: formatCentsForLlm(
				projection.scenarios.base.months[0]?.reserveFloor ?? 0,
			),
		},
		plans: snapshot.plans.map((plan) => ({
			id: plan.id,
			name: capUntrusted(plan.name, MAX_NAME),
			type: plan.type,
			priority: plan.priority,
			nonNegotiable: plan.nonNegotiable,
			lifecycle: plan.lifecycle,
			basis: plan.basis,
			index: plan.index,
			targetMonth: plan.targetMonth,
			window: plan.window,
			potAccountIds: plan.potAccountIds,
			fields: toLlmFields(plan.fields),
			events: plan.events.map((event) => ({
				label: capUntrusted(event.label, MAX_NAME),
				direction: event.direction,
				basis: event.basis,
				amount: toLlmRange(event.amount),
				startMonth: event.startMonth,
				endMonth: event.endMonth,
			})),
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
							planName: capUntrusted(plan.name, MAX_NAME),
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
				summary: capUntrusted(assumption.summary, MAX_SUMMARY),
				source: assumption.source,
			})),
	};
}
