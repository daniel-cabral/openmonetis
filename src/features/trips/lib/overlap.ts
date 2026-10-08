import type { TripOption } from "@/shared/lib/trips/types";
import { formatDateOnly } from "@/shared/utils/date";

const NUMERIC_DATE = {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
} as const;

// Inclusive ranges: sharing a single day is already an overlap (D2).
export function findOverlappingTrip(
	candidate: { id?: string; startDate: string; endDate: string },
	trips: TripOption[],
): TripOption | undefined {
	return trips.find(
		(trip) =>
			trip.id !== candidate.id &&
			trip.startDate <= candidate.endDate &&
			candidate.startDate <= trip.endDate,
	);
}

export function buildOverlapMessage(trip: TripOption): string {
	const start = formatDateOnly(trip.startDate, NUMERIC_DATE);
	const end = formatDateOnly(trip.endDate, NUMERIC_DATE);
	return `As datas se sobrepõem à viagem "${trip.name}" (${start} a ${end}).`;
}
