import type { SubcategoryOption } from "@/shared/lib/subcategories/types";

export const SUBCATEGORY_FILTER_PARAM = "subcategoria";
export const NO_SUBCATEGORY_FILTER = "sem";

const NO_SUBCATEGORY_NAME = "Sem subcategoria";

export type SubcategoryBreakdownRow = {
	subcategoryId: string | null;
	name: string;
	amount: number;
	percent: number;
};

export function buildSubcategoryBreakdown(
	transactions: Array<{ amount: number; subcategoryId?: string | null }>,
	subcategories: SubcategoryOption[],
): SubcategoryBreakdownRow[] {
	if (subcategories.length === 0) return [];

	const knownIds = new Set(subcategories.map((subcategory) => subcategory.id));
	const centsById = new Map<string, number>();
	let noneCents = 0;
	let hasNone = false;
	let totalCents = 0;

	for (const transaction of transactions) {
		const cents = Math.round(Math.abs(transaction.amount) * 100);
		totalCents += cents;

		const id = transaction.subcategoryId;
		if (id && knownIds.has(id)) {
			centsById.set(id, (centsById.get(id) ?? 0) + cents);
		} else {
			hasNone = true;
			noneCents += cents;
		}
	}

	const toPercent = (cents: number) =>
		totalCents === 0 ? 0 : Math.round((cents * 1000) / totalCents) / 10;

	const rows: SubcategoryBreakdownRow[] = subcategories
		.filter((subcategory) => centsById.has(subcategory.id))
		.map((subcategory) => ({
			subcategoryId: subcategory.id,
			name: subcategory.name,
			cents: centsById.get(subcategory.id) ?? 0,
		}))
		.sort((a, b) => b.cents - a.cents)
		.map(({ subcategoryId, name, cents }) => ({
			subcategoryId,
			name,
			amount: cents / 100,
			percent: toPercent(cents),
		}));

	if (hasNone) {
		rows.push({
			subcategoryId: null,
			name: NO_SUBCATEGORY_NAME,
			amount: noneCents / 100,
			percent: toPercent(noneCents),
		});
	}

	return rows;
}

export function filterTransactionsBySubcategory<
	T extends { subcategoryId?: string | null },
>(
	transactions: T[],
	filter: string | null,
	subcategories: SubcategoryOption[],
): T[] {
	if (filter === NO_SUBCATEGORY_FILTER) {
		return transactions.filter((transaction) => !transaction.subcategoryId);
	}
	if (
		!filter ||
		!subcategories.some((subcategory) => subcategory.id === filter)
	) {
		return transactions;
	}
	return transactions.filter(
		(transaction) => transaction.subcategoryId === filter,
	);
}
