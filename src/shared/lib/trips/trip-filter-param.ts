import type { TripOption } from "./queries";

export const TRIP_FILTER_PARAM = "viagem";
export const TRIP_FILTER_NONE_VALUE = "sem";

export type TripFilter =
	| { kind: "all" }
	| { kind: "none" }
	| { kind: "trip"; tripId: string; name: string };

/**
 * Reads the `viagem` URL param. Only trips owned by the user are accepted;
 * anything else falls back to "all" so foreign ids leak nothing.
 */
export function parseTripFilterParam(
	value: string | null,
	userTrips: TripOption[],
): TripFilter {
	if (!value) return { kind: "all" };
	if (value === TRIP_FILTER_NONE_VALUE) return { kind: "none" };
	const trip = userTrips.find((item) => item.id === value);
	return trip
		? { kind: "trip", tripId: trip.id, name: trip.name }
		: { kind: "all" };
}

export function tripFilterToParam(filter: TripFilter): string | null {
	if (filter.kind === "none") return TRIP_FILTER_NONE_VALUE;
	if (filter.kind === "trip") return filter.tripId;
	return null;
}
