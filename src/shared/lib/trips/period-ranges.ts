import { and, eq, isNotNull, max, min } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { db } from "@/shared/lib/db";

export type TripPeriodRange = { startPeriod: string; endPeriod: string };

/**
 * Smallest and largest `periodo` among each trip's transactions, keyed by trip id.
 * Trips without transactions are absent.
 */
export async function fetchTripPeriodRanges(
	userId: string,
): Promise<Record<string, TripPeriodRange>> {
	const rows = await db
		.select({
			tripId: transactions.tripId,
			startPeriod: min(transactions.period),
			endPeriod: max(transactions.period),
		})
		.from(transactions)
		.where(and(eq(transactions.userId, userId), isNotNull(transactions.tripId)))
		.groupBy(transactions.tripId);

	const ranges: Record<string, TripPeriodRange> = {};
	for (const row of rows) {
		if (!row.tripId || !row.startPeriod || !row.endPeriod) continue;
		ranges[row.tripId] = {
			startPeriod: row.startPeriod,
			endPeriod: row.endPeriod,
		};
	}
	return ranges;
}
