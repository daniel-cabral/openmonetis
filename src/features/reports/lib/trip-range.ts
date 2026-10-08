import type { TripPeriodRange } from "@/shared/lib/trips/period-ranges";
import { TRIP_FILTER_PARAM } from "@/shared/lib/trips/trip-filter-param";
import { addMonthsToPeriod, comparePeriods } from "@/shared/utils/period";

/** Same ceiling enforced by `validateDateRange`. */
export const MAX_REPORT_MONTHS = 24;

/**
 * Range the trends report jumps to when a trip is chosen: every period with a
 * transaction of the trip, capped at MAX_REPORT_MONTHS from the first one.
 * A trip without transactions keeps the current range.
 */
export function resolveTripRange(
	range: TripPeriodRange | undefined,
	current: TripPeriodRange,
): TripPeriodRange {
	if (!range) return current;
	const maxEnd = addMonthsToPeriod(range.startPeriod, MAX_REPORT_MONTHS - 1);
	const endPeriod =
		comparePeriods(range.endPeriod, maxEnd) > 0 ? maxEnd : range.endPeriod;
	return { startPeriod: range.startPeriod, endPeriod };
}

export function buildTripSearchParams(
	currentSearch: string,
	tripParam: string | null,
	range: TripPeriodRange,
): string {
	const params = new URLSearchParams(currentSearch);
	if (tripParam) {
		params.set(TRIP_FILTER_PARAM, tripParam);
	} else {
		params.delete(TRIP_FILTER_PARAM);
	}
	params.set("inicio", range.startPeriod);
	params.set("fim", range.endPeriod);
	return params.toString();
}

/** "Limpar": back to all transactions, no categories, given range. */
export function buildResetSearchParams(
	currentSearch: string,
	range: TripPeriodRange,
): string {
	const params = new URLSearchParams(
		buildTripSearchParams(currentSearch, null, range),
	);
	params.delete("categorias");
	return params.toString();
}
