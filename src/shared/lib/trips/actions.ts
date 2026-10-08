"use server";

import { getUserId } from "@/shared/lib/auth/server";
import { fetchUserTrips } from "./queries";
import type { TripOption } from "./types";

export async function fetchTripOptionsAction(): Promise<TripOption[]> {
	const userId = await getUserId();
	return fetchUserTrips(userId);
}
