import type { Cents, Period } from "@/features/planning/lib/engine";
import type { CategoryTotal } from "@/features/planning/lib/queries/category-totals";

export type CutCandidate = {
	categoryId: string;
	categoryName: string;
	monthlyAverage: Cents;
	lastMonth: Cents;
};

const MAX_CANDIDATES = 5;

export function rankCutCandidates(
	totals: CategoryTotal[],
	months: number,
	excludedCategoryIds: Set<string>,
): CutCandidate[] {
	const lastMonth: Period = totals.reduce(
		(latest, total) => (total.month > latest ? total.month : latest),
		"",
	);
	const byCategory = new Map<
		string,
		{ categoryId: string; categoryName: string; sum: Cents; lastMonth: Cents }
	>();

	for (const total of totals) {
		if (excludedCategoryIds.has(total.categoryId)) {
			continue;
		}
		const entry = byCategory.get(total.categoryId) ?? {
			categoryId: total.categoryId,
			categoryName: total.categoryName,
			sum: 0,
			lastMonth: 0,
		};
		entry.sum += total.amount;
		if (total.month === lastMonth) {
			entry.lastMonth += total.amount;
		}
		byCategory.set(total.categoryId, entry);
	}

	return [...byCategory.values()]
		.map((entry) => ({
			categoryId: entry.categoryId,
			categoryName: entry.categoryName,
			monthlyAverage: Math.round(entry.sum / months),
			lastMonth: entry.lastMonth,
		}))
		.sort((a, b) => b.monthlyAverage - a.monthlyAverage)
		.slice(0, MAX_CANDIDATES);
}
