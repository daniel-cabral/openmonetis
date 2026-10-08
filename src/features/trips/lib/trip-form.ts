export type TripFormTrip = {
	id: string;
	name: string;
	startDate: string;
	endDate: string;
	note: string | null;
};

export type TripFormValues = {
	name: string;
	startDate: string;
	endDate: string;
	note: string;
};

// Empty when creating, the saved trip when editing.
export function toTripFormValues(trip?: TripFormTrip): TripFormValues {
	return {
		name: trip?.name ?? "",
		startDate: trip?.startDate ?? "",
		endDate: trip?.endDate ?? "",
		note: trip?.note ?? "",
	};
}
