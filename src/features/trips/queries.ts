import { and, asc, eq, gte, isNull, lte, type SQL } from "drizzle-orm";
import {
	cards,
	categories,
	financialAccounts,
	payers,
	transactions,
	trips,
} from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";
import { tripEligibleCondition } from "@/shared/lib/trips/eligibility";
import { toDateOnlyString } from "@/shared/utils/date";
import { dedupeSuggestions } from "./lib/suggestions";
import {
	summarizeTrip,
	type TripSummary,
	type TripTransactionRow,
} from "./lib/summary";

export type TripDetail = {
	trip: {
		id: string;
		name: string;
		startDate: string;
		endDate: string;
		note: string | null;
	};
	summary: TripSummary;
	linked: TripTransactionRow[];
	suggestions: TripTransactionRow[];
};

async function fetchTripRows(where: SQL): Promise<TripTransactionRow[]> {
	const rows = await db
		.select({
			id: transactions.id,
			name: transactions.name,
			purchaseDate: transactions.purchaseDate,
			amount: transactions.amount,
			transactionType: transactions.transactionType,
			payerId: transactions.payerId,
			payerName: payers.name,
			categoryName: categories.name,
			cardName: cards.name,
			accountName: financialAccounts.name,
			currentInstallment: transactions.currentInstallment,
			installmentCount: transactions.installmentCount,
			seriesId: transactions.seriesId,
			splitGroupId: transactions.splitGroupId,
		})
		.from(transactions)
		.leftJoin(payers, eq(payers.id, transactions.payerId))
		.leftJoin(categories, eq(categories.id, transactions.categoryId))
		.leftJoin(cards, eq(cards.id, transactions.cardId))
		.leftJoin(
			financialAccounts,
			eq(financialAccounts.id, transactions.accountId),
		)
		.where(where)
		.orderBy(
			asc(transactions.purchaseDate),
			asc(transactions.currentInstallment),
			asc(transactions.createdAt),
		);

	return rows.map((row) => ({
		...row,
		purchaseDate: toDateOnlyString(row.purchaseDate) ?? "",
		amount: Number(row.amount),
	}));
}

export async function fetchTripDetail(
	userId: string,
	tripId: string,
): Promise<TripDetail | null> {
	const [trip] = await db
		.select({
			id: trips.id,
			name: trips.name,
			startDate: trips.startDate,
			endDate: trips.endDate,
			note: trips.note,
		})
		.from(trips)
		.where(and(eq(trips.id, tripId), eq(trips.userId, userId)))
		.limit(1);

	if (!trip) return null;

	const adminPayerId = await getAdminPayerId(userId);

	const [linked, candidates] = await Promise.all([
		fetchTripRows(
			and(
				eq(transactions.userId, userId),
				eq(transactions.tripId, trip.id),
			) as SQL,
		),
		fetchTripRows(
			and(
				eq(transactions.userId, userId),
				isNull(transactions.tripId),
				gte(transactions.purchaseDate, trip.startDate),
				lte(transactions.purchaseDate, trip.endDate),
				tripEligibleCondition(),
			) as SQL,
		),
	]);

	return {
		trip: {
			id: trip.id,
			name: trip.name,
			startDate: toDateOnlyString(trip.startDate) ?? "",
			endDate: toDateOnlyString(trip.endDate) ?? "",
			note: trip.note,
		},
		summary: summarizeTrip(linked, adminPayerId),
		linked,
		suggestions: dedupeSuggestions(candidates),
	};
}
