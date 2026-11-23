import { comparePeriods } from "@/shared/utils/period";
import type { AmountRange, BidPoint, Cents, ConsorcioFields } from "../types";

export const BID_HISTORY_MONTHS = 6;

export function bidPctRange(history: BidPoint[], marginPp: number): AmountRange | null {
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
				? { min: outstandingBalance, base: outstandingBalance, max: outstandingBalance }
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
