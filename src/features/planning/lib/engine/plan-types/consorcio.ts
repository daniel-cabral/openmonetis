import {
	addMonthsToPeriod,
	buildPeriodRange,
	comparePeriods,
} from "@/shared/utils/period";
import { inflateToMonth } from "../money";
import type {
	AmountRange,
	BidPoint,
	Cents,
	ConsorcioFields,
	EnginePlan,
	ExpandedEvent,
	Period,
	PostBidMode,
} from "../types";
import type { ExpandContext } from "./context";

export const BID_HISTORY_MONTHS = 6;

export function bidPctRange(
	history: BidPoint[],
	marginPp: number,
): AmountRange | null {
	if (history.length === 0) {
		return null;
	}
	const sorted = [...history].sort((a, b) => comparePeriods(a.month, b.month));
	const recent = sorted.slice(-BID_HISTORY_MONTHS);
	const pcts = recent.map((point) => point.winningBidPct);
	const latest = sorted[sorted.length - 1]?.winningBidPct ?? 0;
	return {
		min: Math.min(...pcts) + marginPp,
		base: latest + marginPp,
		max: Math.max(...pcts) + marginPp,
	};
}

export function consorcioOwnCash(
	fields: ConsorcioFields,
	pct: AmountRange,
	letterAtBid: Cents,
): AmountRange {
	const { outstandingBalance, bidBase, embeddedBid } = fields;
	const bases: AmountRange =
		bidBase === "letter"
			? { min: letterAtBid, base: letterAtBid, max: letterAtBid }
			: bidBase === "outstanding"
				? {
						min: outstandingBalance,
						base: outstandingBalance,
						max: outstandingBalance,
					}
				: {
						min: Math.min(letterAtBid, outstandingBalance),
						base: Math.max(letterAtBid, outstandingBalance),
						max: Math.max(letterAtBid, outstandingBalance),
					};

	const own: AmountRange = {
		min: Math.round((pct.min * bases.min) / 100),
		base: Math.round((pct.base * bases.base) / 100),
		max: Math.round((pct.max * bases.max) / 100),
	};
	if (!embeddedBid.enabled) {
		return own;
	}
	const embedded = Math.round((letterAtBid * embeddedBid.pct) / 100);
	return {
		min: Math.max(0, own.min - embedded),
		base: Math.max(0, own.base - embedded),
		max: Math.max(0, own.max - embedded),
	};
}

/** Own cash plus embedded part: the full bid that reduces the balance. */
export function consorcioTotalBid(
	fields: ConsorcioFields,
	pct: AmountRange,
	letterAtBid: Cents,
): AmountRange {
	return consorcioOwnCash(
		{ ...fields, embeddedBid: { enabled: false, pct: 0 } },
		pct,
		letterAtBid,
	);
}

/** Installment after the bid: balance is installment x months left, minus the bid. */
export function postBidInstallment(
	installmentAtTarget: Cents,
	monthsLeft: number,
	totalBid: Cents,
	mode: PostBidMode,
): { amount: Cents; months: number } {
	const left = Math.max(0, installmentAtTarget * monthsLeft - totalBid);
	if (left === 0) {
		return { amount: 0, months: 0 };
	}
	if (mode === "reduce-term") {
		return {
			amount: installmentAtTarget,
			months: Math.ceil(left / installmentAtTarget),
		};
	}
	return { amount: Math.round(left / monthsLeft), months: monthsLeft };
}

function monthsBetween(from: Period, to: Period): number {
	return buildPeriodRange(from, to).length - 1;
}

function sameAmount(amount: Cents): AmountRange {
	return { min: amount, base: amount, max: amount };
}

/** Monthly installments up to the bid, then the reduced remainder up to the last installment. */
function expandInstallmentEvents(
	plan: EnginePlan & { fields: ConsorcioFields },
	ctx: ExpandContext,
	installment: Cents,
	bidEvent: ExpandedEvent | null,
	totalBid: AmountRange | null,
): ExpandedEvent[] {
	const { fields, targetMonth } = plan;
	const index = ctx.indexForecastPct[plan.index];
	const last = fields.lastInstallmentMonth ?? targetMonth;
	const events: ExpandedEvent[] = [];
	const push = (month: Period, amount: AmountRange) =>
		events.push({
			planId: plan.id,
			month,
			direction: "outflow",
			amount,
			label: "installment",
		});

	// Without a bid there is no reduction: the installment runs to the last month.
	const lastBeforeBid = bidEvent ? targetMonth : last;
	if (comparePeriods(ctx.start, lastBeforeBid) <= 0) {
		for (const month of buildPeriodRange(ctx.start, lastBeforeBid)) {
			push(
				month,
				sameAmount(inflateToMonth(installment, index, ctx.start, month)),
			);
		}
	}
	if (!bidEvent || !totalBid) {
		return events;
	}
	events.push(bidEvent);

	if (comparePeriods(last, targetMonth) <= 0) {
		return events;
	}
	const monthsLeft = monthsBetween(targetMonth, last);
	const installmentAtTarget = inflateToMonth(
		installment,
		index,
		ctx.start,
		targetMonth,
	);
	const after = (["min", "base", "max"] as const).map((slot) =>
		postBidInstallment(
			installmentAtTarget,
			monthsLeft,
			totalBid[slot],
			fields.postBidMode ?? "reduce-installment",
		),
	);
	for (let k = 1; k <= monthsLeft; k++) {
		const month = addMonthsToPeriod(targetMonth, k);
		const [min, base, max] = after.map((slot) =>
			k <= slot.months
				? inflateToMonth(slot.amount, index, targetMonth, month)
				: 0,
		);
		if (min || base || max) {
			push(month, { min: min ?? 0, base: base ?? 0, max: max ?? 0 });
		}
	}
	return events;
}

export function expandConsorcioEvents(
	plan: EnginePlan & { fields: ConsorcioFields },
	ctx: ExpandContext,
): ExpandedEvent[] {
	const events: ExpandedEvent[] = [];
	const installment = plan.fields.monthlyInstallment ?? 0;

	if (installment <= 0 && plan.mappedMonthlyOutflow > 0) {
		for (const month of buildPeriodRange(ctx.start, ctx.end)) {
			events.push({
				planId: plan.id,
				month,
				direction: "outflow",
				amount: {
					min: plan.mappedMonthlyOutflow,
					base: plan.mappedMonthlyOutflow,
					max: plan.mappedMonthlyOutflow,
				},
				label: "mapped",
			});
		}
	}

	const range = bidPctRange(plan.bidHistory, plan.fields.marginPp);
	if (range) {
		const pct = ctx.stress.bidAtRangeMax
			? { min: range.max, base: range.max, max: range.max }
			: range;
		const letterAtBid =
			plan.basis === "today"
				? inflateToMonth(
						plan.fields.letterValue,
						ctx.indexForecastPct[plan.index],
						ctx.start,
						plan.targetMonth,
					)
				: plan.fields.letterValue;
		const bidEvent: ExpandedEvent = {
			planId: plan.id,
			month: plan.targetMonth,
			direction: "outflow",
			amount: consorcioOwnCash(plan.fields, pct, letterAtBid),
			label: plan.name,
		};
		if (installment > 0) {
			return expandInstallmentEvents(
				plan,
				ctx,
				installment,
				bidEvent,
				consorcioTotalBid(plan.fields, pct, letterAtBid),
			);
		}
		events.push(bidEvent);
	} else if (installment > 0) {
		return expandInstallmentEvents(plan, ctx, installment, null, null);
	}

	return events;
}
