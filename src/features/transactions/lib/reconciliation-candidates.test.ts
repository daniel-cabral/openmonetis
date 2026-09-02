import { describe, expect, it } from "vitest";
import { matchReconciliationRows } from "@/shared/lib/reconciliation/matcher";
import {
	type ReconciliationCandidateRow,
	toAppTransaction,
} from "./reconciliation-candidates";

function dbRow(
	overrides: Partial<ReconciliationCandidateRow> = {},
): ReconciliationCandidateRow {
	return {
		id: "tx-1",
		name: "Compra teste",
		purchaseDate: new Date("2026-07-10T00:00:00.000Z"),
		amount: "-25.90",
		transactionType: "Despesa",
		installmentCount: null,
		currentInstallment: null,
		ofxImportFingerprint: null,
		...overrides,
	};
}

describe("toAppTransaction", () => {
	it("traduz 'Despesa' do banco para 'expense' do matcher", () => {
		expect(toAppTransaction(dbRow()).transactionType).toBe("expense");
	});

	it("traduz 'Receita' do banco para 'income' do matcher", () => {
		const row = dbRow({ transactionType: "Receita", amount: "1200.00" });
		expect(toAppTransaction(row).transactionType).toBe("income");
	});

	it("normaliza o valor para positivo, deixando o sinal com o tipo", () => {
		expect(toAppTransaction(dbRow()).amount).toBe(25.9);
	});

	it("leva o nome do lançamento, que é o que a revisão mostra ao usuário", () => {
		expect(toAppTransaction(dbRow({ name: "Mercado do mês" })).name).toBe(
			"Mercado do mês",
		);
	});

	it("reduz a data ao dia e preserva parcela e fingerprint já gravado", () => {
		const app = toAppTransaction(
			dbRow({
				installmentCount: 12,
				currentInstallment: 2,
				ofxImportFingerprint: "fp-a",
			}),
		);

		expect(app).toMatchObject({
			date: "2026-07-10",
			installmentCount: 12,
			currentInstallment: 2,
			fingerprint: "fp-a",
		});
	});

	it("casa uma despesa do banco com a linha de despesa do arquivo", () => {
		const result = matchReconciliationRows({
			rows: [
				{
					fingerprint: "fp-a",
					row: {
						externalId: null,
						externalIdOccurrence: 0,
						date: "2026-07-10",
						amount: 25.9,
						description: "LOJA TESTE",
						sourceDescription: "LOJA TESTE",
						transactionType: "expense",
					},
				},
			],
			transactions: [toAppTransaction(dbRow())],
		});

		expect(result.rows[0]).toMatchObject({
			status: "matched",
			rule: "exact",
			transactionId: "tx-1",
		});
	});
});
