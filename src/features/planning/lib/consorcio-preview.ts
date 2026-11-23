import {
	bidPctRange,
	consorcioOwnCash,
	inflateToMonth,
} from "@/features/planning/lib/engine";
import type {
	AmountRange,
	BidPoint,
	ConsorcioFields,
	MoneyBasis,
	Period,
} from "@/features/planning/lib/engine";

export type BidPreview = {
	pct: AmountRange | null;
	letter: AmountRange | null;
	outstanding: AmountRange | null;
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
		return { pct: null, letter: null, outstanding: null };
	}
	const letterAtBid =
		basis === "today"
			? inflateToMonth(fields.letterValue, inccPct, start, targetMonth)
			: fields.letterValue;
	return {
		pct,
		letter: consorcioOwnCash({ ...fields, bidBase: "letter" }, pct, letterAtBid),
		outstanding: consorcioOwnCash({ ...fields, bidBase: "outstanding" }, pct, letterAtBid),
	};
}
