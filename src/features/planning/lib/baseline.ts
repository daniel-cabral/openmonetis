import {
	ACCOUNT_AUTO_INVOICE_NOTE_PREFIX,
	ACCOUNT_BALANCE_ADJUSTMENT_NAME,
	INITIAL_BALANCE_CATEGORY_NAME,
	INVOICE_ADJUSTMENT_NAME,
	REFUND_NOTE_PREFIX,
} from "@/shared/lib/accounts/constants";
import type { Cents, Period } from "@/features/planning/lib/engine";

export const INVESTMENT_ACCOUNT_TYPE = "Conta Investimento";
export const CONTRIBUTION_CATEGORY_NAME = "Investimentos";
export const YIELD_CATEGORY_NAME = "Rendimentos";

export type TxRow = {
	id: string;
	period: Period;
	date: string;
	name: string;
	amount: Cents; // signed
	transactionType: string;
	categoryId: string | null;
	categoryName: string | null;
	note: string | null;
	transferId: string | null;
	accountType: string | null;
};

export type TxClass =
	| "income"
	| "cost"
	| "contribution"
	| "mapped"
	| "irregular"
	| "ignored";

export type ClassificationContext = {
	mappedCategoryPlan: Map<string, string>;
	irregularCategoryIds: Set<string>;
};

export function classifyTransaction(
	row: TxRow,
	ctx: ClassificationContext,
): TxClass {
	if (row.transactionType === "Transferência" || row.transferId !== null) {
		return row.accountType === INVESTMENT_ACCOUNT_TYPE && row.amount > 0
			? "contribution"
			: "ignored";
	}
	if (
		row.note?.startsWith(ACCOUNT_AUTO_INVOICE_NOTE_PREFIX) ||
		row.name === INVOICE_ADJUSTMENT_NAME ||
		row.name === ACCOUNT_BALANCE_ADJUSTMENT_NAME ||
		row.categoryName === INITIAL_BALANCE_CATEGORY_NAME
	) {
		return "ignored";
	}
	if (row.categoryName === CONTRIBUTION_CATEGORY_NAME) {
		return row.transactionType === "Despesa" ? "contribution" : "ignored";
	}
	if (row.transactionType === "Receita") {
		if (row.categoryName === YIELD_CATEGORY_NAME) {
			return "ignored";
		}
		return row.note?.startsWith(REFUND_NOTE_PREFIX) ? "cost" : "income";
	}
	if (row.categoryId && ctx.mappedCategoryPlan.has(row.categoryId)) {
		return "mapped";
	}
	if (row.categoryId && ctx.irregularCategoryIds.has(row.categoryId)) {
		return "irregular";
	}
	return "cost";
}

export type Baselines = {
	incomeBaseline: Cents;
	costOfLiving: Cents;
	contributionsByMonth: { month: Period; amount: Cents }[];
	mappedMonthlyByPlan: Record<string, Cents>;
};

export function buildBaselines(
	rows: TxRow[],
	months: Period[],
	ctx: ClassificationContext,
): Baselines {
	let income = 0;
	let cost = 0;
	const contributionByMonth = new Map<Period, number>();
	const mappedTotalByPlan: Record<string, number> = {};

	for (const row of rows) {
		const kind = classifyTransaction(row, ctx);
		if (kind === "income") {
			income += row.amount;
		} else if (kind === "cost") {
			cost -= row.amount;
		} else if (kind === "contribution") {
			contributionByMonth.set(
				row.period,
				(contributionByMonth.get(row.period) ?? 0) + Math.abs(row.amount),
			);
		} else if (kind === "mapped") {
			const planId = ctx.mappedCategoryPlan.get(row.categoryId ?? "");
			if (planId) {
				mappedTotalByPlan[planId] = (mappedTotalByPlan[planId] ?? 0) - row.amount;
			}
		}
	}

	const average = (total: number) => Math.round(total / months.length);

	return {
		incomeBaseline: average(income),
		costOfLiving: average(cost),
		contributionsByMonth: [...months].sort().map((month) => ({
			month,
			amount: contributionByMonth.get(month) ?? 0,
		})),
		mappedMonthlyByPlan: Object.fromEntries(
			Object.entries(mappedTotalByPlan).map(([planId, total]) => [
				planId,
				average(total),
			]),
		),
	};
}
