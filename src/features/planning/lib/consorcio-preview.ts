import type {
	AmountRange,
	BidPoint,
	Cents,
	ConsorcioFields,
	MoneyBasis,
	Period,
} from "@/features/planning/lib/engine";
import {
	bidPctRange,
	consorcioOwnCash,
	consorcioTotalBid,
	inflateToMonth,
	postBidInstallment,
} from "@/features/planning/lib/engine";
import { buildPeriodRange } from "@/shared/utils/period";

export type BidPreview = {
	pct: AmountRange | null;
	letter: AmountRange | null;
	outstanding: AmountRange | null;
	afterBid: Record<
		"min" | "base" | "max",
		{ amount: Cents; months: number }
	> | null;
};

/** Own cash per bid base at the target month, so "both" can be shown side by side. */
export function buildBidPreview(
	fields: ConsorcioFields,
	history: BidPoint[],
	inccPct: number,
	start: Period,
	targetMonth: Period,
	basis: MoneyBasis,
): BidPreview {
	const pct = bidPctRange(history, fields.marginPp);
	if (!pct) {
		return { pct: null, letter: null, outstanding: null, afterBid: null };
	}
	const letterAtBid =
		basis === "today"
			? inflateToMonth(fields.letterValue, inccPct, start, targetMonth)
			: fields.letterValue;
	return {
		pct,
		afterBid: previewAfterBid(
			fields,
			pct,
			letterAtBid,
			inccPct,
			start,
			targetMonth,
		),
		letter: consorcioOwnCash(
			{ ...fields, bidBase: "letter" },
			pct,
			letterAtBid,
		),
		outstanding: consorcioOwnCash(
			{ ...fields, bidBase: "outstanding" },
			pct,
			letterAtBid,
		),
	};
}

function previewAfterBid(
	fields: ConsorcioFields,
	pct: AmountRange,
	letterAtBid: Cents,
	inccPct: number,
	start: Period,
	targetMonth: Period,
): BidPreview["afterBid"] {
	const { monthlyInstallment, lastInstallmentMonth } = fields;
	if (!monthlyInstallment || monthlyInstallment <= 0 || !lastInstallmentMonth) {
		return null;
	}
	const monthsLeft =
		buildPeriodRange(targetMonth, lastInstallmentMonth).length - 1;
	if (monthsLeft <= 0) {
		return null;
	}
	const atTarget = inflateToMonth(
		monthlyInstallment,
		inccPct,
		start,
		targetMonth,
	);
	const totalBid = consorcioTotalBid(fields, pct, letterAtBid);
	const mode = fields.postBidMode ?? "reduce-installment";
	return {
		min: postBidInstallment(atTarget, monthsLeft, totalBid.min, mode),
		base: postBidInstallment(atTarget, monthsLeft, totalBid.base, mode),
		max: postBidInstallment(atTarget, monthsLeft, totalBid.max, mode),
	};
}
