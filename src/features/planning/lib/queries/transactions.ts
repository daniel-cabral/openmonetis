import { and, eq, inArray } from "drizzle-orm";
import { categories, financialAccounts, transactions } from "@/db/schema";
import type { TxRow } from "@/features/planning/lib/baseline";
import { toCents } from "@/features/planning/lib/cents";
import type { Period } from "@/features/planning/lib/engine";
import { db } from "@/shared/lib/db";
import { toDateOnlyString } from "@/shared/utils/date";

export async function fetchBaselineRows(
	userId: string,
	adminPayerId: string | null,
	periods: Period[],
): Promise<TxRow[]> {
	if (!adminPayerId) {
		return [];
	}

	const rows = await db
		.select({
			id: transactions.id,
			period: transactions.period,
			date: transactions.purchaseDate,
			name: transactions.name,
			amount: transactions.amount,
			transactionType: transactions.transactionType,
			categoryId: transactions.categoryId,
			categoryName: categories.name,
			note: transactions.note,
			transferId: transactions.transferId,
			accountType: financialAccounts.accountType,
		})
		.from(transactions)
		.leftJoin(categories, eq(categories.id, transactions.categoryId))
		.leftJoin(
			financialAccounts,
			eq(financialAccounts.id, transactions.accountId),
		)
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.payerId, adminPayerId),
				inArray(transactions.period, periods),
			),
		);

	return rows.map((row) => ({
		...row,
		date: toDateOnlyString(row.date) ?? "",
		amount: toCents(row.amount),
	}));
}
