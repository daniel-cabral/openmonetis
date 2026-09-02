import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseC6InvoiceCsv } from "@/shared/lib/import/parsers/c6-invoice-csv";
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

function invoiceTransactions() {
	return parseC6InvoiceCsv(readFixture("c6-fatura.csv")).transactions;
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
				date: row.date,
				amount: row.amount,
				transactionType: row.transactionType,
				installmentCount: null,
				currentInstallment: null,
				fingerprint: `fp-${index}`,
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

describe("checkInvoiceClosure", () => {
	it("soma apenas as compras e fecha contra o total informado", () => {
		const result = checkInvoiceClosure(invoiceTransactions(), 13034.33);

		expect(result).toEqual({
			closes: true,
			purchasesSum: 13034.33,
			expectedTotal: 13034.33,
			difference: 0,
		});
	});

	it("exclui pagamentos e estornos da soma", () => {
		const transactions = invoiceTransactions();
		const naoCompras = transactions.filter(
			(transaction) => transaction.isPurchase === false,
		);

		expect(naoCompras).toHaveLength(2);
		// Se as não-compras entrassem na soma, o total seria 772.23.
		expect(checkInvoiceClosure(transactions, 772.23).closes).toBe(false);
	});

	it("reporta a diferença quando a soma das compras não bate com o total", () => {
		const result = checkInvoiceClosure(invoiceTransactions(), 13000);

		expect(result).toMatchObject({ closes: false, difference: -34.33 });
	});
});
