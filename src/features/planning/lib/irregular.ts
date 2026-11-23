import type { Cents, Period } from "@/features/planning/lib/engine";
import { classifyTransaction, type TxRow } from "./baseline";

export const IRREGULAR_MIN_SHARE = 0.25;
const IRREGULAR_MAX_MONTHS = 2;

export type IrregularExpense = {
	calendarMonth: number;
	amount: Cents;
	label: string;
};

type CategoryTotals = {
	label: string;
	total: Cents;
	byPeriod: Map<Period, Cents>;
};

export function detectIrregularExpenses(
	rows: TxRow[],
	months: Period[],
): { expenses: IrregularExpense[]; categoryIds: Set<string> } {
	const noMappings = {
		mappedCategoryPlan: new Map<string, string>(),
		irregularCategoryIds: new Set<string>(),
	};
	const inWindow = new Set(months);
	const byCategory = new Map<string, CategoryTotals>();
	let totalCost = 0;

	for (const row of rows) {
		if (
			!inWindow.has(row.period) ||
			!row.categoryId ||
			classifyTransaction(row, noMappings) !== "cost"
		) {
			continue;
		}
		const cost = -row.amount;
		totalCost += cost;
		const category = byCategory.get(row.categoryId) ?? {
			label: row.categoryName ?? "",
			total: 0,
			byPeriod: new Map<Period, Cents>(),
		};
		category.total += cost;
		category.byPeriod.set(row.period, (category.byPeriod.get(row.period) ?? 0) + cost);
		byCategory.set(row.categoryId, category);
	}

	const threshold = (totalCost / months.length) * IRREGULAR_MIN_SHARE;
	const expenses: IrregularExpense[] = [];
	const categoryIds = new Set<string>();

	for (const [categoryId, category] of byCategory) {
		if (
			category.byPeriod.size > IRREGULAR_MAX_MONTHS ||
			category.total < threshold
		) {
			continue;
		}
		categoryIds.add(categoryId);
		for (const [period, amount] of category.byPeriod) {
			expenses.push({
				calendarMonth: Number(period.slice(5)),
				amount,
				label: category.label,
			});
		}
	}

	return { expenses, categoryIds };
}
