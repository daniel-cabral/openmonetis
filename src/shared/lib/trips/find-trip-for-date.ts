import type { TripOption } from "./types";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Trips never overlap (D2), so at most one trip contains a given date.
export function findTripForDate(
	trips: TripOption[],
	date: string,
): TripOption | undefined {
	if (!DATE_ONLY.test(date)) return undefined;
	return trips.find((trip) => trip.startDate <= date && date <= trip.endDate);
}
