import { describe, expect, it } from "vitest";
import type { ImportedTransaction } from "@/shared/lib/import/types";
import type {
	AppTransaction,
	ReconciliationMatch,
	RowClassification,
} from "@/shared/lib/reconciliation/matcher";
import {
	buildReconciliationApplyPayload,
	deriveReconciliationClosure,
	filterAppOnlyByScope,
	isNonPurchaseLine,
	summarizeReconciliationMatch,
} from "./reconciliation-review";

function row(overrides: Partial<ImportedTransaction> = {}): ImportedTransaction {
	return {
		externalId: null,
		externalIdOccurrence: 0,
		date: "2026-07-10",
		amount: 25.9,
		description: "LOJA TESTE",
		sourceDescription: "LOJA TESTE",
		transactionType: "expense",
		...overrides,
	};
}

describe("summarizeReconciliationMatch", () => {
	it("conta cada balde a partir da classificação", () => {
		const rows: RowClassification[] = [
			{
				index: 0,
				fingerprint: "fp-1",
				row: row(),
				status: "matched",
				rule: "exact",
				transactionId: "tx-1",
				amountDivergence: null,
			},
			{ index: 1, fingerprint: "fp-2", row: row(), status: "bank-only" },
			{
				index: 2,
				fingerprint: "fp-3",
				row: row(),
				status: "ambiguous",
				candidateIds: ["tx-2", "tx-3"],
			},
		];
		const match: ReconciliationMatch = { rows, appOnlyIds: ["tx-4", "tx-5"] };

		expect(summarizeReconciliationMatch(match)).toEqual({
			matched: 1,
			bankOnly: 1,
			appOnly: 2,
			ambiguous: 1,
		});
	});
});

describe("buildReconciliationApplyPayload", () => {
	it("mapeia confirm, create, ignore e ignora skip", () => {
		const defaultPayerId = "payer-default";

		const payload = buildReconciliationApplyPayload(
			[
				{
					fingerprint: "fp-confirm",
					decision: {
						action: "confirm",
						transactionId: "tx-1",
						descriptor: "LOJA TESTE",
					},
				},
				{
					fingerprint: "fp-create",
					decision: {
						action: "create",
						date: "2026-07-10",
						amount: 25.9,
						transactionType: "expense",
						descriptor: "LOJA TESTE",
						name: "LOJA NOVA",
						categoryId: "cat-1",
						payerId: null,
					},
				},
				{
					fingerprint: "fp-ignore",
					decision: { action: "ignore", reason: "Pagamento de fatura" },
				},
				{ fingerprint: "fp-skip", decision: { action: "skip" } },
			],
			defaultPayerId,
		);

		expect(payload).toEqual({
			confirmations: [
				{
					fingerprint: "fp-confirm",
					transactionId: "tx-1",
					descriptor: "LOJA TESTE",
				},
			],
			creations: [
				{
					fingerprint: "fp-create",
					date: "2026-07-10",
					amount: 25.9,
					transactionType: "expense",
					descriptor: "LOJA TESTE",
					name: "LOJA NOVA",
					categoryId: "cat-1",
					payerId: defaultPayerId,
				},
			],
			ignores: [{ fingerprint: "fp-ignore", reason: "Pagamento de fatura" }],
		});
	});

	it("mantém payerId explícito da criação quando informado", () => {
		const payload = buildReconciliationApplyPayload(
			[
				{
					fingerprint: "fp-create",
					decision: {
						action: "create",
						date: "2026-07-10",
						amount: 10,
						transactionType: "income",
						descriptor: "X BRUTO",
						name: "X",
						categoryId: null,
						payerId: "payer-explicit",
					},
				},
			],
			"payer-default",
		);

		expect(payload.creations[0]?.payerId).toBe("payer-explicit");
	});
});

describe("isNonPurchaseLine", () => {
	it("é falso quando lineKind é purchase ou ausente (extrato)", () => {
		expect(isNonPurchaseLine(row({ lineKind: "purchase" }))).toBe(false);
		expect(isNonPurchaseLine(row({ lineKind: undefined }))).toBe(false);
	});

	it("é verdadeiro para credit e invoice-payment", () => {
		expect(isNonPurchaseLine(row({ lineKind: "credit" }))).toBe(true);
		expect(isNonPurchaseLine(row({ lineKind: "invoice-payment" }))).toBe(true);
	});
});

describe("filterAppOnlyByScope", () => {
	function appTx(overrides: Partial<AppTransaction> = {}): AppTransaction {
		return {
			id: "tx-1",
			name: "Lançamento",
			date: "2026-08-10",
			amount: 100,
			transactionType: "expense",
			installmentCount: null,
			currentInstallment: null,
			fingerprint: null,
			period: "2026-08",
			isDivided: false,
			...overrides,
		};
	}

	it("filtra por intervalo [from, to] quando o destino é conta", () => {
		const transactions = [
			appTx({ id: "dentro", date: "2026-08-15" }),
			appTx({ id: "antes", date: "2026-07-31" }),
			appTx({ id: "depois", date: "2026-09-01" }),
		];

		const result = filterAppOnlyByScope(transactions, {
			destinationKind: "account",
			from: "2026-08-01",
			to: "2026-08-31",
		});

		expect(result.map((tx) => tx.id)).toEqual(["dentro"]);
	});

	it("filtra por period = invoicePeriod quando o destino é cartão", () => {
		const transactions = [
			appTx({ id: "mesmo-periodo", period: "2026-08", date: "2025-12-01" }),
			appTx({ id: "outro-periodo", period: "2026-07" }),
		];

		const result = filterAppOnlyByScope(transactions, {
			destinationKind: "card",
			invoicePeriod: "2026-08",
		});

		expect(result.map((tx) => tx.id)).toEqual(["mesmo-periodo"]);
	});
});

describe("deriveReconciliationClosure", () => {
	it("deriva fechamento de extrato quando o perfil não é fatura", () => {
		const closure = deriveReconciliationClosure({
			profileKind: "statement",
			transactions: [row()],
			invoiceTotalInput: "",
		});

		expect(closure?.kind).toBe("statement");
	});

	it("retorna null para fatura sem total informado", () => {
		const closure = deriveReconciliationClosure({
			profileKind: "invoice",
			transactions: [row()],
			invoiceTotalInput: "",
		});

		expect(closure).toBeNull();
	});

	it("deriva fechamento de fatura a partir do total informado", () => {
		const closure = deriveReconciliationClosure({
			profileKind: "invoice",
			transactions: [row({ amount: 25.9, transactionType: "expense" })],
			invoiceTotalInput: "25,90",
		});

		expect(closure?.kind).toBe("invoice");
		expect(closure?.kind === "invoice" && closure.result.closes).toBe(true);
	});

	it("recalcula quando o total informado muda, sem novos dados", () => {
		const transactions = [row({ amount: 25.9, transactionType: "expense" })];

		const divergente = deriveReconciliationClosure({
			profileKind: "invoice",
			transactions,
			invoiceTotalInput: "10,00",
		});
		const fechado = deriveReconciliationClosure({
			profileKind: "invoice",
			transactions,
			invoiceTotalInput: "25,90",
		});

		expect(divergente?.kind === "invoice" && divergente.result.closes).toBe(
			false,
		);
		expect(fechado?.kind === "invoice" && fechado.result.closes).toBe(true);
	});
});
