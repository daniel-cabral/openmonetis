import type { InvestmentPosition } from "@/db/schema";
import {
	buildBaselines,
	classifyTransaction,
} from "@/features/planning/lib/baseline";
import type { EngineInput } from "@/features/planning/lib/engine";
import { detectIrregularExpenses } from "@/features/planning/lib/irregular";
import {
	latestPositionSet,
	toEnginePlan,
	toEnginePosition,
	toSettingsInput,
} from "@/features/planning/lib/mappers";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { toDateOnlyString } from "@/shared/utils/date";
import {
	addMonthsToPeriod,
	buildPeriodRange,
	getCurrentPeriod,
} from "@/shared/utils/period";
import {
	fetchAssumptionRows,
	fetchBidRows,
	fetchCategoryMappings,
	fetchInvestmentAccounts,
	fetchInvestmentPositions,
	fetchPlanEventRows,
	fetchPlanningSettingsRow,
	fetchPlanRows,
} from "./lib/queries/planning-rows";
import { fetchBaselineRows } from "./lib/queries/transactions";
import type {
	AssumptionView,
	InvestmentAccountView,
	PlanningSnapshot,
	PlanView,
	PositionView,
} from "./lib/snapshot-types";

const IRREGULAR_WINDOW_MONTHS = 12;

function toPositionView(row: InvestmentPosition): PositionView {
	const position = toEnginePosition(row);
	return {
		id: position.id,
		description: row.description,
		amount: position.amount,
		liquidity: position.liquidity,
		maturityMonth: position.maturityMonth,
		annualRealReturnPct: position.annualRealReturnPct,
		asOf: toDateOnlyString(row.asOf) ?? "",
	};
}

export async function fetchPlanningSnapshot(
	userId: string,
	now: Date = new Date(),
): Promise<PlanningSnapshot> {
	const currentMonth = getCurrentPeriod(now);

	const [
		settingsRow,
		adminPayerId,
		accountRows,
		positionRows,
		planRows,
		eventRows,
		bidRows,
		mappingRows,
		assumptionRows,
	] = await Promise.all([
		fetchPlanningSettingsRow(userId),
		getAdminPayerId(userId),
		fetchInvestmentAccounts(userId),
		fetchInvestmentPositions(userId),
		fetchPlanRows(userId),
		fetchPlanEventRows(userId),
		fetchBidRows(userId),
		fetchCategoryMappings(userId),
		fetchAssumptionRows(userId),
	]);

	const settings = toSettingsInput(settingsRow);
	const baselineMonths = buildPeriodRange(
		addMonthsToPeriod(currentMonth, -settings.baselineMonths),
		addMonthsToPeriod(currentMonth, -1),
	);
	const irregularMonths = buildPeriodRange(
		addMonthsToPeriod(currentMonth, -IRREGULAR_WINDOW_MONTHS),
		addMonthsToPeriod(currentMonth, -1),
	);
	const windowStart = addMonthsToPeriod(
		currentMonth,
		-Math.max(settings.baselineMonths, IRREGULAR_WINDOW_MONTHS),
	);
	const rows = await fetchBaselineRows(
		userId,
		adminPayerId,
		buildPeriodRange(windowStart, currentMonth),
	);

	const irregular = detectIrregularExpenses(rows, irregularMonths);
	const ctx = {
		mappedCategoryPlan: new Map(
			mappingRows.map(
				(mapping) => [mapping.categoryId, mapping.planId] as const,
			),
		),
		irregularCategoryIds: irregular.categoryIds,
	};
	const baselines = buildBaselines(
		rows.filter((row) => baselineMonths.includes(row.period)),
		baselineMonths,
		ctx,
	);

	const currentMonthContributions = rows
		.filter(
			(row) =>
				row.period === currentMonth &&
				classifyTransaction(row, ctx) === "contribution",
		)
		.map((row) => ({
			id: row.id,
			name: row.name,
			date: row.date,
			amount: Math.abs(row.amount),
		}));

	const latestPositions = latestPositionSet(positionRows);

	const accounts: InvestmentAccountView[] = accountRows.map((account) => {
		const latestForAccount = latestPositions.filter(
			(row) => row.accountId === account.id,
		);
		return {
			id: account.id,
			name: account.name,
			logo: account.logo,
			isEarmarkedPot: account.isEarmarkedPot,
			lastAsOf: toDateOnlyString(latestForAccount[0]?.asOf),
			positions: latestForAccount.map(toPositionView),
		};
	});

	const plans: PlanView[] = planRows.map((row) => ({
		...toEnginePlan(
			row,
			eventRows,
			bidRows,
			baselines.mappedMonthlyByPlan[row.id] ?? 0,
		),
		type: row.type as PlanView["type"],
		categoryIds: mappingRows
			.filter((mapping) => mapping.planId === row.id)
			.map((mapping) => mapping.categoryId),
	}));

	const input: EngineInput = {
		startMonth: currentMonth,
		horizonEnd: settings.horizonEnd,
		positions: latestPositions.map(toEnginePosition),
		potAccountIds: accountRows
			.filter((account) => account.isEarmarkedPot)
			.map((account) => account.id),
		incomeBaseline: baselines.incomeBaseline,
		costOfLiving: baselines.costOfLiving,
		irregularExpenses: irregular.expenses,
		reserveMonths: settings.reserveMonths,
		indexForecastPct: settings.indexForecastPct,
		plans,
		stress: {},
		extraMonthlySaving: 0,
	};

	const assumptions: AssumptionView[] = assumptionRows.map((row) => ({
		id: row.id,
		kind: row.kind,
		summary: row.summary,
		source: row.source as AssumptionView["source"],
		proposalId: row.proposalId,
		reviewByMonth: row.reviewByMonth as AssumptionView["reviewByMonth"],
		createdAt: row.createdAt.toISOString(),
	}));

	return {
		currentMonth,
		input,
		settings,
		plans,
		accounts,
		contributionsByMonth: baselines.contributionsByMonth,
		currentMonthContributions,
		assumptions,
	};
}
