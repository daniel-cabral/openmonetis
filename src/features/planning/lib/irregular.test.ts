import { describe, expect, it } from "vitest";
import type { Period } from "@/features/planning/lib/engine";
import type { TxRow } from "./baseline";
import { detectIrregularExpenses } from "./irregular";

const MONTHS = Array.from(
	{ length: 12 },
	(_, index) => `2026-${String(index + 1).padStart(2, "0")}` as Period,
);

function expense(
	period: Period,
	categoryId: string,
	categoryName: string,
	amount: number,
): TxRow {
	return {
		id: `${categoryId}-${period}`,
		period,
		date: `${period}-05`,
		name: categoryName,
		amount,
		transactionType: "Despesa",
		categoryId,
		categoryName,
		note: null,
		transferId: null,
		accountType: "Conta Corrente",
	};
}

const groceries = MONTHS.map((period) =>
	expense(period, "cat-mercado", "Mercado", -40_000),
);

describe("detectIrregularExpenses", () => {
	it("flags a category paid in one month and splits expenses by calendar month", () => {
		const rows = [
			...groceries,
			expense(MONTHS[1], "cat-impostos", "Impostos", -30_000),
		];

		expect(detectIrregularExpenses(rows, MONTHS)).toEqual({
			expenses: [{ calendarMonth: 2, amount: 30_000, label: "Impostos" }],
			categoryIds: new Set(["cat-impostos"]),
		});
	});

	it("flags a category paid in two months, one expense per calendar month", () => {
		const rows = [
			...groceries,
			expense(MONTHS[1], "cat-impostos", "Impostos", -15_000),
			expense(MONTHS[5], "cat-impostos", "Impostos", -15_000),
		];

		expect(detectIrregularExpenses(rows, MONTHS)).toEqual({
			expenses: [
				{ calendarMonth: 2, amount: 15_000, label: "Impostos" },
				{ calendarMonth: 6, amount: 15_000, label: "Impostos" },
			],
			categoryIds: new Set(["cat-impostos"]),
		});
	});

	it.each([
		[
			"paid in every month",
			groceries,
		],
		[
			"paid in three distinct months",
			[
				...groceries,
				expense(MONTHS[2], "cat-presentes", "Presentes", -20_000),
				expense(MONTHS[5], "cat-presentes", "Presentes", -20_000),
				expense(MONTHS[8], "cat-presentes", "Presentes", -20_000),
			],
		],
		[
			"below the share of mean monthly cost",
			[...groceries, expense(MONTHS[3], "cat-taxa", "Taxa", -1_000)],
		],
	])("does not flag a category %s", (_label, rows) => {
		expect(detectIrregularExpenses(rows, MONTHS).categoryIds).toEqual(new Set());
	});
});
