import { eq, isNull, type SQL } from "drizzle-orm";
import { transactions } from "@/db/schema";
import type { TripFilter } from "./trip-filter-param";

export function tripFilterCondition(filter: TripFilter): SQL | undefined {
	if (filter.kind === "none") return isNull(transactions.tripId);
	if (filter.kind === "trip") return eq(transactions.tripId, filter.tripId);
	return undefined;
}
