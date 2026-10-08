"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { TripFilterSelect } from "@/features/reports/components/trip-filter-select";
import type { TripOption } from "@/shared/lib/trips/queries";
import { TRIP_FILTER_PARAM } from "@/shared/lib/trips/trip-filter-param";

type EstablishmentsTripFilterProps = {
	trips: TripOption[];
	value: string | null;
};

/** Sets or drops `viagem` in the query string, keeping every other param. */
export function buildEstablishmentsTripSearch(
	currentSearch: string,
	tripParam: string | null,
): string {
	const params = new URLSearchParams(currentSearch);
	if (tripParam) {
		params.set(TRIP_FILTER_PARAM, tripParam);
	} else {
		params.delete(TRIP_FILTER_PARAM);
	}
	return params.toString();
}

export function EstablishmentsTripFilter({
	trips,
	value,
}: EstablishmentsTripFilterProps) {
	const router = useRouter();
	const searchParams = useSearchParams();

	const handleChange = (next: string | null) => {
		const search = buildEstablishmentsTripSearch(searchParams.toString(), next);
		router.push(`/reports/establishments?${search}`);
	};

	return (
		<TripFilterSelect trips={trips} value={value} onChange={handleChange} />
	);
}
