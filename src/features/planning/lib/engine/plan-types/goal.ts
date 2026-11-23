import { addMonthsToPeriod, comparePeriods } from "@/shared/utils/period";
import { inflateToMonth } from "../money";
import type { AmountRange, Cents, EnginePlan, ExpandedEvent, GoalFields, Period } from "../types";
import type { ExpandContext } from "./context";

export function expandGoalEvents(
	plan: EnginePlan & { fields: GoalFields },
	ctx: ExpandContext,
): ExpandedEvent[] {
	const payments: Period[] = [];
	for (
		let month = ctx.start;
		comparePeriods(month, plan.targetMonth) < 0;
		month = addMonthsToPeriod(month, 1)
	) {
		payments.push(month);
	}

	const inflate = (value: Cents): Cents =>
		plan.basis === "today"
			? inflateToMonth(value, ctx.indexForecastPct[plan.index], ctx.start, plan.targetMonth)
			: value;
	const paid = payments.length * plan.mappedMonthlyOutflow;
	const reduce = (value: Cents): Cents => Math.max(0, inflate(value) - paid);

	const target = plan.fields.target;
	const mappedAmount: AmountRange = {
		min: plan.mappedMonthlyOutflow,
		base: plan.mappedMonthlyOutflow,
		max: plan.mappedMonthlyOutflow,
	};
	const events: ExpandedEvent[] =
		plan.mappedMonthlyOutflow > 0
			? payments.map((month): ExpandedEvent => ({
					planId: plan.id,
					month,
					direction: "outflow",
					amount: mappedAmount,
					label: "mapped",
				}))
			: [];

	const amount: AmountRange = {
		min: reduce(target.min),
		base: reduce(target.base),
		max: reduce(target.max),
	};
	events.push({
		planId: plan.id,
		month: plan.targetMonth,
		direction: "outflow",
		amount,
		label: plan.name,
	});
	return events;
}
