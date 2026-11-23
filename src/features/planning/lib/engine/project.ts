import { buildPeriodRange, parsePeriod } from "@/shared/utils/period";
import { advanceMonth, type Buckets, bucketsTotal, openBuckets } from "./buckets";
import { pickAmount } from "./money";
import type { Cents, EngineInput, ExpandedEvent, MonthRow, Period, Scenario, ScenarioResult, UnfundedAt } from "./types";

export function projectScenario(
	input: EngineInput,
	scenario: Scenario,
	events: ExpandedEvent[],
	range: { start: Period; end: Period },
): ScenarioResult {
	let buckets: Buckets = openBuckets(input.positions, input.potAccountIds, range.start, input.indexForecastPct.IPCA);
	const reserveFloor = Math.round(input.reserveMonths * input.costOfLiving);
	const rows: MonthRow[] = [];
	const activePlans = input.plans
		.filter((plan) => plan.lifecycle === "active")
		.sort((a, b) => a.priority - b.priority);
	const requiredByPlan: Record<string, Cents> = {};
	const shortfallByPlan: Record<string, Cents> = {};
	let firstUnfunded: UnfundedAt | null = null;

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

		const pots = { ...buckets.pots };
		let general = buckets.general;
		let required = 0;
		let paid = 0;
		const unfundedPlanIds: string[] = [];
		for (const plan of activePlans) {
			const claim = events
				.filter((event) => event.planId === plan.id && event.month === month && event.direction === "outflow")
				.reduce((total, event) => total + pickAmount(event.amount, "outflow", scenario), 0);
			if (claim === 0) {
				continue;
			}
			required += claim;
			requiredByPlan[plan.id] = (requiredByPlan[plan.id] ?? 0) + claim;

			const ownPots = plan.potAccountIds.filter((accountId) => accountId in pots);
			const available =
				Math.max(0, general - reserveFloor) + ownPots.reduce((total, accountId) => total + pots[accountId], 0);
			if (claim > available) {
				unfundedPlanIds.push(plan.id);
				shortfallByPlan[plan.id] = (shortfallByPlan[plan.id] ?? 0) + claim;
				firstUnfunded ??= { month, planId: plan.id };
				continue;
			}

			let remaining = claim;
			for (const accountId of ownPots) {
				const taken = Math.min(remaining, pots[accountId]);
				pots[accountId] -= taken;
				remaining -= taken;
			}
			general -= remaining;
			paid += claim;
		}

		buckets = { ...buckets, general, pots };
		const potTotal = Object.values(buckets.pots).reduce((total, amount) => total + amount, 0);

		rows.push({
			month,
			totalPatrimony: bucketsTotal(buckets),
			liquid: buckets.general + potTotal,
			required,
			paid,
			reserveFloor,
			slack: buckets.general - reserveFloor,
			unfundedPlanIds,
			reserveBreached: buckets.general < reserveFloor,
		});
	}

	return { scenario, months: rows, firstUnfunded, requiredByPlan, shortfallByPlan };
}
