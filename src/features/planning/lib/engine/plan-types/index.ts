import { buildPeriodRange, comparePeriods } from "@/shared/utils/period";
import { inflateToMonth, scaleRange } from "../money";
import type { EnginePlan, ExpandedEvent, PlanEventInput } from "../types";
import type { ExpandContext } from "./context";
import { expandConsorcioEvents } from "./consorcio";
import { expandGoalEvents } from "./goal";

function expandTypedEvents(plan: EnginePlan, ctx: ExpandContext): ExpandedEvent[] {
	if (plan.fields.type === "goal") {
		return expandGoalEvents({ ...plan, fields: plan.fields }, ctx);
	}
	return expandConsorcioEvents({ ...plan, fields: plan.fields }, ctx);
}

function expandManualEvent(
	plan: EnginePlan,
	event: PlanEventInput,
	ctx: ExpandContext,
): ExpandedEvent[] {
	const first =
		comparePeriods(event.startMonth, ctx.start) < 0 ? ctx.start : event.startMonth;
	const last = event.endMonth ?? ctx.end;
	const stop = comparePeriods(last, ctx.end) > 0 ? ctx.end : last;
	if (comparePeriods(first, stop) > 0) {
		return [];
	}
	return buildPeriodRange(first, stop).map((month) => {
		const inflate = (value: number) =>
			plan.basis === "today"
				? inflateToMonth(value, ctx.indexForecastPct[plan.index], ctx.start, month)
				: value;
		return {
			planId: plan.id,
			month,
			direction: event.direction,
			amount: {
				min: inflate(event.amount.min),
				base: inflate(event.amount.base),
				max: inflate(event.amount.max),
			},
			label: event.label,
		};
	});
}

export function expandPlanEvents(plan: EnginePlan, ctx: ExpandContext): ExpandedEvent[] {
	if (plan.lifecycle !== "active") {
		return [];
	}
	const costScale = 1 + (ctx.stress.planCostPct ?? 0) / 100;
	return [
		...expandTypedEvents(plan, ctx),
		...plan.events.flatMap((event) => expandManualEvent(plan, event, ctx)),
	]
		.filter(
			(event) =>
				comparePeriods(event.month, ctx.start) >= 0 &&
				comparePeriods(event.month, ctx.end) <= 0,
		)
		.map((event) =>
			event.direction === "outflow"
				? { ...event, amount: scaleRange(event.amount, costScale) }
				: event,
		);
}
