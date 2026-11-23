import { and, eq, gte, lte, sum } from "drizzle-orm";
import { categories, transactions } from "@/db/schema";
import { toCents } from "@/features/planning/lib/cents";
import type { Cents, Period } from "@/features/planning/lib/engine";
import { db } from "@/shared/lib/db";

export type CategoryTotal = {
	categoryId: string;
	categoryName: string;
	month: Period;
	amount: Cents;
};

export async function fetchCategoryTotals(
	userId: string,
	adminPayerId: string,
	from: Period,
	to: Period,
): Promise<CategoryTotal[]> {
	const rows = await db
		.select({
			categoryId: categories.id,
			categoryName: categories.name,
			month: transactions.period,
			total: sum(transactions.amount),
		})
		.from(transactions)
		.innerJoin(categories, eq(categories.id, transactions.categoryId))
		.where(
			and(
				eq(transactions.userId, userId),
				eq(transactions.payerId, adminPayerId),
				eq(transactions.transactionType, "Despesa"),
				gte(transactions.period, from),
				lte(transactions.period, to),
			),
		)
		.groupBy(categories.id, categories.name, transactions.period);

	return rows.map((row) => ({
		categoryId: row.categoryId,
		categoryName: row.categoryName,
		month: row.month,
		// despesas são gravadas com sinal negativo
		amount: 0 - toCents(row.total),
	}));
}
