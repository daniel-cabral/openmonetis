import { describe, expect, it } from "vitest";
import {
	buildBaselines,
	CONTRIBUTION_CATEGORY_NAME,
	classifyTransaction,
	INVESTMENT_ACCOUNT_TYPE,
	type TxRow,
	YIELD_CATEGORY_NAME,
} from "./baseline";
import {
	ACCOUNT_AUTO_INVOICE_NOTE_PREFIX,
	ACCOUNT_BALANCE_ADJUSTMENT_NAME,
	INITIAL_BALANCE_CATEGORY_NAME,
	INVOICE_ADJUSTMENT_NAME,
	REFUND_NOTE_PREFIX,
} from "@/shared/lib/accounts/constants";

const ctx = {
	mappedCategoryPlan: new Map([["cat-mapped", "plan-1"]]),
	irregularCategoryIds: new Set(["cat-irregular"]),
};

function row(overrides: Partial<TxRow>): TxRow {
	return {
		id: "tx-1",
		period: "2026-10",
		date: "2026-10-05",
		name: "Lancamento sintetico",
		amount: -10_000,
		transactionType: "Despesa",
		categoryId: "cat-plain",
		categoryName: "Lazer",
		note: null,
		transferId: null,
		accountType: "Conta Corrente",
		...overrides,
	};
}

describe("classifyTransaction", () => {
	it.each([
		[
			"transfer into an investment account",
			row({ transactionType: "Transferência", amount: 50_000, accountType: INVESTMENT_ACCOUNT_TYPE }),
			"contribution",
		],
		[
			"transfer into a checking account",
			row({ transactionType: "Transferência", transferId: "t-1", amount: 50_000 }),
			"ignored",
		],
		[
			"card invoice payment",
			row({ note: `${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}card-1:2026-10` }),
			"ignored",
		],
		[
			"invoice adjustment",
			row({ name: INVOICE_ADJUSTMENT_NAME, transactionType: "Receita", amount: 5_000 }),
			"ignored",
		],
		[
			"balance adjustment",
			row({ name: ACCOUNT_BALANCE_ADJUSTMENT_NAME, transactionType: "Receita", amount: 5_000 }),
			"ignored",
		],
		[
			"opening balance",
			row({ categoryName: INITIAL_BALANCE_CATEGORY_NAME, transactionType: "Receita", amount: 5_000 }),
			"ignored",
		],
		[
			"expense in the investments category",
			row({ categoryName: CONTRIBUTION_CATEGORY_NAME }),
			"contribution",
		],
		[
			"income in the investments category (redemption)",
			row({ transactionType: "Receita", amount: 30_000, categoryName: CONTRIBUTION_CATEGORY_NAME }),
			"ignored",
		],
		[
			"income in the yield category",
			row({ transactionType: "Receita", amount: 30_000, categoryName: YIELD_CATEGORY_NAME }),
			"ignored",
		],
		[
			"refund reduces cost",
			row({ transactionType: "Receita", amount: 8_000, note: `${REFUND_NOTE_PREFIX}tx-0` }),
			"cost",
		],
		["expense in a mapped category", row({ categoryId: "cat-mapped" }), "mapped"],
		["expense in an irregular category", row({ categoryId: "cat-irregular" }), "irregular"],
		["plain expense", row({}), "cost"],
		["plain income", row({ transactionType: "Receita", amount: 500_000 }), "income"],
	])("classifies %s", (_label, input, expected) => {
		expect(classifyTransaction(input, ctx)).toBe(expected);
	});
});

describe("buildBaselines", () => {
	it("averages income, cost and mapped outflow and sums contributions per month", () => {
		const rows = [
			row({ id: "i1", period: "2026-10", transactionType: "Receita", amount: 500_000 }),
			row({ id: "i2", period: "2026-11", transactionType: "Receita", amount: 520_000 }),
			row({ id: "c1", period: "2026-10", amount: -300_000 }),
			row({ id: "c2", period: "2026-11", amount: -340_000 }),
			row({ id: "c3", period: "2026-11", amount: -340_000, note: `${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}card-1:2026-11` }),
			row({ id: "m1", period: "2026-10", categoryId: "cat-mapped", amount: -20_000 }),
			row({ id: "m2", period: "2026-11", categoryId: "cat-mapped", amount: -20_000 }),
			row({ id: "k1", period: "2026-10", categoryName: CONTRIBUTION_CATEGORY_NAME, amount: -20_000 }),
		];

		expect(buildBaselines(rows, ["2026-10", "2026-11"], ctx)).toEqual({
			incomeBaseline: 510_000,
			costOfLiving: 320_000,
			contributionsByMonth: [
				{ month: "2026-10", amount: 20_000 },
				{ month: "2026-11", amount: 0 },
			],
			mappedMonthlyByPlan: { "plan-1": 20_000 },
		});
	});
});
