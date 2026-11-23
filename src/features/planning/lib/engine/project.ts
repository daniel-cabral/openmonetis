import { buildPeriodRange, parsePeriod } from "@/shared/utils/period";
import { type Buckets, advanceMonth, bucketsTotal, openBuckets } from "./buckets";
import { pickAmount } from "./money";
import type { EngineInput, ExpandedEvent, MonthRow, Period, Scenario, ScenarioResult } from "./types";

export function projectScenario(
	input: EngineInput,
	scenario: Scenario,
	events: ExpandedEvent[],
	range: { start: Period; end: Period },
): ScenarioResult {
	let buckets: Buckets = openBuckets(input.positions, input.potAccountIds, range.start, input.indexForecastPct.IPCA);
	const reserveFloor = Math.round(input.reserveMonths * input.costOfLiving);
	const rows: MonthRow[] = [];

	for (const [index, month] of buildPeriodRange(range.start, range.end).entries()) {
		if (index > 0) {
			buckets = advanceMonth(buckets, month);
		}

		const income = index < (input.stress.incomeLossMonths ?? 0) ? 0 : input.incomeBaseline;
		let regular = income - input.costOfLiving + input.extraMonthlySaving;
		if (input.stress.contributionCap !== undefined) {
			regular = Math.min(regular, input.stress.contributionCap);
		}

		const calendarMonth = parsePeriod(month).month;
		const irregular = input.irregularExpenses
			.filter((expense) => expense.calendarMonth === calendarMonth)
			.reduce((total, expense) => total + expense.amount, 0);
		const inflows = events
			.filter((event) => event.month === month && event.direction === "inflow")
			.reduce((total, event) => total + pickAmount(event.amount, "inflow", scenario), 0);

		buckets = { ...buckets, general: buckets.general + regular - irregular + inflows };
		const potTotal = Object.values(buckets.pots).reduce((total, amount) => total + amount, 0);

		rows.push({
			month,
			totalPatrimony: bucketsTotal(buckets),
			liquid: buckets.general + potTotal,
			required: 0,
			paid: 0,
			reserveFloor,
			slack: buckets.general - reserveFloor,
			unfundedPlanIds: [],
			reserveBreached: buckets.general < reserveFloor,
		});
	}

	return { scenario, months: rows, firstUnfunded: null, requiredByPlan: {}, shortfallByPlan: {} };
}
