import type {
	BidRecord,
	InvestmentPosition,
	Plan,
	PlanEventRow,
	PlanningSettings,
} from "@/db/schema";
import { toCents } from "@/features/planning/lib/cents";
import type {
	BidPoint,
	Cents,
	ConsorcioFields,
	PostBidMode,
	Direction,
	EnginePlan,
	EnginePosition,
	LiquidityKind,
	MoneyBasis,
	PlanLifecycle,
	PriceIndex,
} from "@/features/planning/lib/engine";
import type { PlanningSettingsInput } from "@/features/planning/lib/schemas";

export const DEFAULT_PLANNING_SETTINGS: PlanningSettingsInput = {
	plannedContribution: 0,
	reserveMonths: 3,
	baselineMonths: 6,
	indexForecastPct: { IPCA: 4, INCC: 5 },
	horizonEnd: null,
	stressContributionCap: null,
	stressIncomeLossMonths: 3,
	stressPlanCostPct: 10,
	plannerModelId: null,
};

/** Keeps, for each account, only the rows of its most recent as-of date. */
export function latestPositionSet(
	rows: InvestmentPosition[],
): InvestmentPosition[] {
	const latestByAccount = new Map<string, number>();
	for (const row of rows) {
		const asOf = row.asOf.getTime();
		if (asOf > (latestByAccount.get(row.accountId) ?? -Infinity)) {
			latestByAccount.set(row.accountId, asOf);
		}
	}
	return rows.filter(
		(row) => row.asOf.getTime() === latestByAccount.get(row.accountId),
	);
}

export function toEnginePosition(row: InvestmentPosition): EnginePosition {
	return {
		id: row.id,
		accountId: row.accountId,
		amount: toCents(row.amount),
		liquidity: row.liquidity as LiquidityKind,
		maturityMonth: row.maturityMonth,
		annualRealReturnPct:
			row.annualRealReturnPct === null ? null : Number(row.annualRealReturnPct),
	};
}

function toPlanFields(row: Plan): EnginePlan["fields"] {
	if (row.type === "consorcio") {
		return {
			type: "consorcio",
			letterValue: toCents(row.letterValue),
			outstandingBalance: toCents(row.outstandingBalance),
			bidBase: row.bidBase as ConsorcioFields["bidBase"],
			marginPp: Number(row.bidMarginPp ?? 0),
			embeddedBid: {
				enabled: row.embeddedBidEnabled,
				pct: Number(row.embeddedBidPct),
			},
			monthlyInstallment:
				row.monthlyInstallment === null ? null : toCents(row.monthlyInstallment),
			lastInstallmentMonth: row.lastInstallmentMonth,
			postBidMode: (row.postBidMode ?? "reduce-installment") as PostBidMode,
		};
	}
	return {
		type: "goal",
		target: {
			min: toCents(row.targetMin),
			base: toCents(row.targetBase),
			max: toCents(row.targetMax),
		},
	};
}

/** mappedMonthlyOutflow is computed from transactions by the caller (D4). */
export function toEnginePlan(
	row: Plan,
	events: PlanEventRow[],
	bids: BidRecord[],
	mappedMonthlyOutflow: Cents,
): EnginePlan {
	return {
		id: row.id,
		name: row.name,
		priority: row.priority,
		nonNegotiable: row.nonNegotiable,
		lifecycle: row.lifecycle as PlanLifecycle,
		basis: row.basis as MoneyBasis,
		index: row.priceIndex as PriceIndex,
		targetMonth: row.targetMonth,
		window:
			row.windowEarliest !== null && row.windowLatest !== null
				? { earliest: row.windowEarliest, latest: row.windowLatest }
				: null,
		potAccountIds: row.potAccountIds,
		fields: toPlanFields(row),
		events: events
			.filter((event) => event.planId === row.id)
			.map((event) => ({
				id: event.id,
				label: event.label,
				direction: event.direction as Direction,
				amount: {
					min: toCents(event.amountMin),
					base: toCents(event.amountBase),
					max: toCents(event.amountMax),
				},
				basis: event.basis as MoneyBasis,
				startMonth: event.startMonth,
				endMonth: event.endMonth,
			})),
		bidHistory: bids
			.filter((bid) => bid.planId === row.id)
			.sort((a, b) => a.month.localeCompare(b.month))
			.map(
				(bid): BidPoint => ({
					month: bid.month,
					winningBidPct: Number(bid.winningBidPct),
				}),
			),
		mappedMonthlyOutflow,
	};
}

export function toSettingsInput(
	row: PlanningSettings | undefined,
): PlanningSettingsInput {
	if (!row) {
		return DEFAULT_PLANNING_SETTINGS;
	}
	return {
		plannedContribution: toCents(row.plannedContribution),
		reserveMonths: row.reserveMonths,
		baselineMonths: row.baselineMonths,
		indexForecastPct: {
			IPCA: Number(row.ipcaForecastPct),
			INCC: Number(row.inccForecastPct),
		},
		horizonEnd: row.horizonEnd,
		stressContributionCap:
			row.stressContributionCap === null
				? null
				: toCents(row.stressContributionCap),
		stressIncomeLossMonths: row.stressIncomeLossMonths,
		stressPlanCostPct: Number(row.stressPlanCostPct),
		plannerModelId: row.plannerModelId,
	};
}
