import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseC6StatementCsv } from "@/shared/lib/import/parsers/c6-statement-csv";
import type { ImportedTransaction } from "@/shared/lib/import/types";
import { checkInvoiceClosure, checkStatementClosure } from "./closure";
import { matchReconciliationRows } from "./matcher";

function readFixture(name: string) {
	return readFileSync(join(__dirname, "__fixtures__", name), "utf8");
}

function statementTransactions() {
	return parseC6StatementCsv(readFixture("c6-extrato.csv")).transactions;
}

describe("checkStatementClosure", () => {
	it("reporta que todos os dias contábeis da fixture fecham", () => {
		const result = checkStatementClosure(statementTransactions());

		expect(result.divergences).toEqual([]);
		expect(result.closes).toBe(true);
		expect(result.days.length).toBeGreaterThan(30);
	});

	it("deixa o primeiro dia contábil como não verificado, por não haver saldo anterior no arquivo", () => {
		const result = checkStatementClosure(statementTransactions());

		expect(result.unverifiedDays).toEqual(["2026-07-06"]);
		expect(result.days.some((day) => day.day === "2026-07-06")).toBe(false);
	});

	it("identifica o dia e a diferença quando um lançamento é adulterado", () => {
		const original = statementTransactions();
		const adulterado = original.findIndex(
			(transaction) => transaction.postedDate === "2026-07-07",
		);
		const transactions = original.map((transaction, index) =>
			index === adulterado
				? { ...transaction, amount: transaction.amount + 10 }
				: transaction,
		);

		const result = checkStatementClosure(transactions);

		expect(result.closes).toBe(false);
		expect(result.divergences).toHaveLength(1);
		expect(result.divergences[0]).toMatchObject({
			day: "2026-07-07",
			movement: -320,
			entriesSum: -330,
			difference: 10,
		});
	});

	it("reporta a divergência mesmo com todas as linhas casadas pelo matcher", () => {
		const original = statementTransactions();
		const adulterado = original.findIndex(
			(transaction) => transaction.postedDate === "2026-07-07",
		);
		const transactions = original.map((transaction, index) =>
			index === adulterado
				? { ...transaction, amount: transaction.amount + 10 }
				: transaction,
		);

		// Um lançamento no app para cada linha do arquivo: o matcher fecha tudo.
		const match = matchReconciliationRows({
			rows: transactions.map((row, index) => ({
				fingerprint: `fp-${index}`,
				row,
			})),
			transactions: transactions.map((row, index) => ({
				id: `t-${index}`,
				name: row.description,
				date: row.date,
				amount: row.amount,
				transactionType: row.transactionType,
				installmentCount: null,
				currentInstallment: null,
				fingerprint: `fp-${index}`,
				period: row.date.slice(0, 7),
				isDivided: false,
			})),
		});

		expect(match.rows.every((row) => row.status === "matched")).toBe(true);
		expect(match.appOnlyIds).toEqual([]);
		expect(checkStatementClosure(transactions).divergences).toHaveLength(1);
	});

	it("agrupa por Data Contábil, não por Data Lançamento", () => {
		// 29/08 e 30/08 (lançamento) caem em 31/08 (contábil), junto com 31/08.
		const result = checkStatementClosure(statementTransactions());
		const lastDay = result.days.find((day) => day.day === "2026-08-31");

		expect(lastDay).toMatchObject({ entriesSum: -461, difference: 0 });
	});

	it("marca como não verificado o dia cujas linhas não trazem saldo", () => {
		const transactions: ImportedTransaction[] = [
			{
				externalId: null,
				externalIdOccurrence: 0,
				date: "2026-07-06",
				postedDate: "2026-07-06",
				amount: 10,
				description: "a",
				sourceDescription: "a",
				transactionType: "expense",
				dayBalance: 100,
			},
			{
				externalId: null,
				externalIdOccurrence: 0,
				date: "2026-07-07",
				postedDate: "2026-07-07",
				amount: 10,
				description: "b",
				sourceDescription: "b",
				transactionType: "expense",
			},
		];

		const result = checkStatementClosure(transactions);

		expect(result.unverifiedDays).toEqual(["2026-07-06", "2026-07-07"]);
		expect(result.days).toEqual([]);
		expect(result.closes).toBe(true);
	});
});

function invoiceLine(
	overrides: Partial<ImportedTransaction> & Pick<ImportedTransaction, "amount" | "transactionType" | "lineKind">,
): ImportedTransaction {
	return {
		externalId: null,
		externalIdOccurrence: 0,
		date: "2026-08-01",
		description: "linha",
		sourceDescription: "linha",
		isPurchase: overrides.lineKind === "purchase",
		...overrides,
	};
}

// Fatura real de 2026-08: compras 13034,33 + crédito −98,00 + pagamento
// −12164,10 fecha exato contra o total informado de 12936,33 (o pagamento
// fica fora da soma, e o crédito entra com sinal negativo).
function fatura202608(): ImportedTransaction[] {
	return [
		invoiceLine({ amount: 13034.33, transactionType: "expense", lineKind: "purchase" }),
		invoiceLine({ amount: 98.0, transactionType: "income", lineKind: "credit" }),
		invoiceLine({ amount: 12164.1, transactionType: "income", lineKind: "invoice-payment" }),
	];
}

describe("checkInvoiceClosure", () => {
	it("soma compras e créditos, exclui o pagamento, e fecha contra o total informado", () => {
		const result = checkInvoiceClosure(fatura202608(), 12936.33);

		expect(result).toEqual({
			closes: true,
			purchasesSum: 12936.33,
			expectedTotal: 12936.33,
			difference: 0,
		});
	});

	it("reporta a diferença quando o total informado foi adulterado", () => {
		const result = checkInvoiceClosure(fatura202608(), 13000);

		expect(result).toMatchObject({ closes: false, difference: 63.67 });
	});

	it("exclui o pagamento da soma mesmo quando ele fecharia contra o total", () => {
		const transactions = fatura202608();
		// Se o pagamento entrasse na soma (13034.33 - 98.00 - 12164.10 = 772.23),
		// o fechamento contra 772.23 daria certo — mas não deve.
		expect(checkInvoiceClosure(transactions, 772.23).closes).toBe(false);
	});
});
