import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	type SQL,
	sql,
} from "drizzle-orm";
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

export type TripListItem = {
	id: string;
	name: string;
	startDate: string;
	endDate: string;
	note: string | null;
	linkedCount: number;
	netCost: number;
};

export async function fetchTripsOverview(
	userId: string,
): Promise<TripListItem[]> {
	const adminPayerId = await getAdminPayerId(userId);

	// Despesa is stored negative and Receita positive, so -sum(amount) is the net cost (D6).
	const netCost = adminPayerId
		? sql<string>`coalesce(sum(-${transactions.amount}) filter (where ${and(
				eq(transactions.payerId, adminPayerId),
				inArray(transactions.transactionType, ["Despesa", "Receita"]),
			)}), 0)`
		: sql<string>`0`;

	const rows = await db
		.select({
			id: trips.id,
			name: trips.name,
			startDate: trips.startDate,
			endDate: trips.endDate,
			note: trips.note,
			linkedCount: sql<number>`count(${transactions.id})::int`,
			netCost,
		})
		.from(trips)
		.leftJoin(
			transactions,
			and(eq(transactions.tripId, trips.id), eq(transactions.userId, userId)),
		)
		.where(eq(trips.userId, userId))
		.groupBy(trips.id)
		.orderBy(desc(trips.startDate));

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		startDate: toDateOnlyString(row.startDate) ?? "",
		endDate: toDateOnlyString(row.endDate) ?? "",
		note: row.note,
		linkedCount: Number(row.linkedCount),
		netCost: Number(row.netCost),
	}));
}
