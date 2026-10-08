import { and, desc, eq } from "drizzle-orm";
import { trips } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { toDateOnlyString } from "@/shared/utils/date";
import type { TripOption } from "./types";

export type { TripOption } from "./types";

export const TRIP_NOT_FOUND_MESSAGE = "Viagem não encontrada.";

export async function fetchUserTrips(userId: string): Promise<TripOption[]> {
	const rows = await db
		.select({
			id: trips.id,
			name: trips.name,
			startDate: trips.startDate,
			endDate: trips.endDate,
		})
		.from(trips)
		.where(eq(trips.userId, userId))
		.orderBy(desc(trips.startDate));

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		startDate: toDateOnlyString(row.startDate) ?? "",
		endDate: toDateOnlyString(row.endDate) ?? "",
	}));
}

export async function isTripOwnedByUser(
	userId: string,
	tripId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ id: trips.id })
		.from(trips)
		.where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
		.limit(1);
	return Boolean(row);
}

export async function validateTripOwnership(
	userId: string,
	tripId: string | null | undefined,
): Promise<string | null> {
	if (!tripId) return null;
	return (await isTripOwnedByUser(userId, tripId))
		? null
		: TRIP_NOT_FOUND_MESSAGE;
}
