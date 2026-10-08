import { findTripForDate } from "@/shared/lib/trips/find-trip-for-date";
import type { TripOption } from "@/shared/lib/trips/types";

// Prefill is only a UI suggestion (D3): it follows the purchase date on create
// until the user touches the field; update shows the stored value untouched.
// Trips not loaded yet (empty list) must not clear a value already shown.
export function resolveAutoTripId(input: {
	mode: "create" | "update";
	touched: boolean;
	trips: TripOption[];
	purchaseDate: string;
	currentTripId: string | undefined;
}): string | undefined {
	if (input.mode !== "create" || input.touched) return input.currentTripId;
	if (input.trips.length === 0) return input.currentTripId;
	return findTripForDate(input.trips, input.purchaseDate)?.id;
}
