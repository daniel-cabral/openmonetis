import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseC6InvoiceCsv } from "../import/parsers/c6-invoice-csv";
import { parseC6StatementCsv } from "../import/parsers/c6-statement-csv";
import type { ImportedTransaction } from "../import/types";
import {
	buildReconciliationFingerprintPayloads,
	type ReconciliationFingerprintInput,
} from "./fingerprint";

const extratoPath = join(__dirname, "__fixtures__", "c6-extrato.csv");
const faturaPath = join(__dirname, "__fixtures__", "c6-fatura.csv");

function statementRow(
	overrides: Partial<ImportedTransaction> = {},
): ImportedTransaction {
	return {
		externalId: null,
		externalIdOccurrence: 0,
		date: "2026-07-10",
		postedDate: "2026-07-11",
		amount: 25.9,
		description: "PIX ENVIADO - LOJA TESTE",
		sourceDescription: "PIX ENVIADO - LOJA TESTE",
		transactionType: "expense",
		dayBalance: 100,
		...overrides,
	};
}

function invoiceRow(
	overrides: Partial<ImportedTransaction> = {},
): ImportedTransaction {
	return {
		externalId: null,
		externalIdOccurrence: 0,
		date: "2026-07-10",
		amount: 86.59,
		description: "LOJA TESTE",
		sourceDescription: "LOJA TESTE",
		transactionType: "expense",
		installment: { number: 1, total: 3 },
		cardLast4: "1000",
		holderName: "Titular Teste 1",
		isPurchase: true,
		...overrides,
	};
}

function statementInput(
	rows: ImportedTransaction[],
	overrides: Partial<ReconciliationFingerprintInput> = {},
): ReconciliationFingerprintInput {
	return {
		kind: "statement",
		source: "C6 Bank",
		accountNumber: "1/99999999",
		destination: { type: "account", id: "account-1" },
		rows,
		...overrides,
	};
}

function invoiceInput(
	rows: ImportedTransaction[],
	overrides: Partial<ReconciliationFingerprintInput> = {},
): ReconciliationFingerprintInput {
	return {
		kind: "invoice",
		source: "C6 Bank",
		accountNumber: null,
		destination: { type: "card", id: "card-1" },
		rows,
		...overrides,
	};
}

function occurrenceOf(payload: string): number {
	const fields = JSON.parse(payload) as unknown[];
	return fields[fields.length - 1] as number;
}

describe("buildReconciliationFingerprintPayloads", () => {
	it("devolve um fingerprint por linha, na ordem do arquivo", () => {
		const payloads = buildReconciliationFingerprintPayloads(
			statementInput([
				statementRow({ description: "A" }),
				statementRow({ description: "B" }),
			]),
		);

		expect(payloads).toHaveLength(2);
		expect(new Set(payloads).size).toBe(2);
	});

	it("dá fingerprints distintos para linhas idênticas no mesmo arquivo", () => {
		const payloads = buildReconciliationFingerprintPayloads(
			statementInput([statementRow(), statementRow(), statementRow()]),
		);

		expect(new Set(payloads).size).toBe(3);
		expect(payloads.map(occurrenceOf)).toEqual([0, 1, 2]);
	});

	it("conta a ocorrência dentro do grupo de linhas idênticas, não na posição do arquivo", () => {
		const payloads = buildReconciliationFingerprintPayloads(
			statementInput([
				statementRow({ description: "A" }),
				statementRow({ description: "B" }),
				statementRow({ description: "A" }),
			]),
		);

		expect(payloads.map(occurrenceOf)).toEqual([0, 0, 1]);
	});

	it("gera exatamente os mesmos fingerprints ao processar o mesmo extrato duas vezes", () => {
		const raw = readFileSync(extratoPath, "utf8");
		const first = buildReconciliationFingerprintPayloads(
			statementInput(parseC6StatementCsv(raw).transactions),
		);
		const second = buildReconciliationFingerprintPayloads(
			statementInput(parseC6StatementCsv(raw).transactions),
		);

		expect(first.length).toBeGreaterThan(0);
		expect(second).toEqual(first);
	});

	it("gera exatamente os mesmos fingerprints ao processar a mesma fatura duas vezes", () => {
		const raw = readFileSync(faturaPath, "utf8");
		const first = buildReconciliationFingerprintPayloads(
			invoiceInput(parseC6InvoiceCsv(raw).transactions),
		);
		const second = buildReconciliationFingerprintPayloads(
			invoiceInput(parseC6InvoiceCsv(raw).transactions),
		);

		expect(first.length).toBeGreaterThan(0);
		expect(second).toEqual(first);
		expect(new Set(first).size).toBe(first.length);
	});

	it("separa linhas do extrato que diferem só na data contábil", () => {
		const [a, b] = buildReconciliationFingerprintPayloads(
			statementInput([
				statementRow({ postedDate: "2026-07-11" }),
				statementRow({ postedDate: "2026-07-12" }),
			]),
		);

		expect(a).not.toBe(b);
		expect(occurrenceOf(a)).toBe(0);
		expect(occurrenceOf(b)).toBe(0);
	});

	it("separa linhas do extrato que diferem só no sinal do valor", () => {
		const [a, b] = buildReconciliationFingerprintPayloads(
			statementInput([
				statementRow({ transactionType: "expense" }),
				statementRow({ transactionType: "income" }),
			]),
		);

		expect(a).not.toBe(b);
	});

	it("separa linhas da fatura que diferem só na parcela", () => {
		const [a, b] = buildReconciliationFingerprintPayloads(
			invoiceInput([
				invoiceRow({ installment: { number: 1, total: 3 } }),
				invoiceRow({ installment: { number: 2, total: 3 } }),
			]),
		);

		expect(a).not.toBe(b);
	});

	it("separa linhas da fatura que diferem só no final do cartão", () => {
		const [a, b] = buildReconciliationFingerprintPayloads(
			invoiceInput([
				invoiceRow({ cardLast4: "1000" }),
				invoiceRow({ cardLast4: "2000" }),
			]),
		);

		expect(a).not.toBe(b);
	});

	it("muda o fingerprint quando o destino escolhido muda", () => {
		const rows = [statementRow()];
		const [a] = buildReconciliationFingerprintPayloads(statementInput(rows));
		const [b] = buildReconciliationFingerprintPayloads(
			statementInput(rows, { destination: { type: "account", id: "account-2" } }),
		);

		expect(a).not.toBe(b);
	});

	it("ignora diferenças de caixa e espaçamento na descrição", () => {
		const payloads = buildReconciliationFingerprintPayloads(
			statementInput([
				statementRow({ description: "PIX ENVIADO - LOJA TESTE" }),
				statementRow({ description: "  pix  enviado -  Loja Teste " }),
			]),
		);

		expect(payloads.map(occurrenceOf)).toEqual([0, 1]);
	});

	it("ignora metadados que não fazem parte da identidade da linha", () => {
		const [a] = buildReconciliationFingerprintPayloads(
			invoiceInput([invoiceRow({ holderName: "Titular Teste 1" })]),
		);
		const [b] = buildReconciliationFingerprintPayloads(
			invoiceInput([invoiceRow({ holderName: "Titular Teste 2" })]),
		);

		expect(a).toBe(b);
	});
});
