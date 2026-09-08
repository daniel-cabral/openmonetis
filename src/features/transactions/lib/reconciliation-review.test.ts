import { describe, expect, it } from "vitest";
import type { ImportedTransaction } from "@/shared/lib/import/types";
import type {
	AppTransaction,
	ReconciliationMatch,
	RowClassification,
} from "@/shared/lib/reconciliation/matcher";
import {
	buildConsumedTransactionIds,
	buildReconciliationApplyPayload,
	buildReconciliationUndoPayload,
	deriveReconciliationClosure,
	evaluateApplyBlock,
	filterAppOnlyByScope,
	initialRowName,
	isCreditLine,
	isInvoicePaymentLine,
	linkPeriodForRow,
	listLinkCandidates,
	resolveAmountUpdate,
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
			manualLinks: [],
			amountUpdates: [],
			ignores: [{ fingerprint: "fp-ignore", reason: "Pagamento de fatura" }],
		});
	});

	it("mapeia amountUpdate da escolha de atualizar em confirm", () => {
		const payload = buildReconciliationApplyPayload(
			[
				{
					fingerprint: "fp-divergente",
					decision: {
						action: "confirm",
						transactionId: "tx-1",
						descriptor: "LOJA TESTE",
						amountUpdate: {
							amount: 30,
							transactionType: "expense",
							isDivided: false,
						},
					},
				},
			],
			"payer-default",
		);

		expect(payload.amountUpdates).toEqual([
			{
				transactionId: "tx-1",
				amount: 30,
				transactionType: "expense",
				isDivided: false,
			},
		]);
	});

	it("nao gera amountUpdate quando os valores ja batem", () => {
		const payload = buildReconciliationApplyPayload(
			[
				{
					fingerprint: "fp-mantido",
					decision: {
						action: "confirm",
						transactionId: "tx-1",
						descriptor: "LOJA TESTE",
					},
				},
			],
			"payer-default",
		);

		expect(payload.amountUpdates).toEqual([]);
	});

	it("mapeia link em manualLinks, com descriptor bruto e nome do lançamento", () => {
		const payload = buildReconciliationApplyPayload(
			[
				{
					fingerprint: "fp-link",
					decision: {
						action: "link",
						transactionId: "tx-9",
						descriptor: "CASA NOVA LOCADORA LTDA - EPP - Boleto",
						name: "Aluguel",
					},
				},
			],
			"payer-default",
		);

		expect(payload.manualLinks).toEqual([
			{
				fingerprint: "fp-link",
				transactionId: "tx-9",
				descriptor: "CASA NOVA LOCADORA LTDA - EPP - Boleto",
				name: "Aluguel",
			},
		]);
		expect(payload.confirmations).toEqual([]);
	});

	it("alinha o valor tambem no vinculo manual", () => {
		// Regressao: o vinculo manual nao carregava valor, entao o lancamento
		// ficava com a estimativa do recorrente em vez do valor cobrado.
		const payload = buildReconciliationApplyPayload(
			[
				{
					fingerprint: "fp-link",
					decision: {
						action: "link",
						transactionId: "tx-unimed",
						descriptor: "Pix recebido de MARIA JOSE SILVA SANTOS",
						name: "Unimed Mãe",
						amountUpdate: {
							amount: 1189.23,
							transactionType: "income",
							isDivided: false,
						},
					},
				},
			],
			"payer-default",
		);

		expect(payload.manualLinks).toHaveLength(1);
		expect(payload.amountUpdates).toEqual([
			{
				transactionId: "tx-unimed",
				amount: 1189.23,
				transactionType: "income",
				isDivided: false,
			},
		]);
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

describe("isInvoicePaymentLine e isCreditLine", () => {
	it("distingue pagamento da fatura anterior de credito desta fatura", () => {
		// Pag Fatura Boleto quita a fatura anterior e ja e despesa da conta;
		// Inclusao de Pagamento e Estorno abatem esta fatura e podem ser lancados.
		expect(isInvoicePaymentLine(row({ lineKind: "invoice-payment" }))).toBe(true);
		expect(isCreditLine(row({ lineKind: "invoice-payment" }))).toBe(false);

		expect(isCreditLine(row({ lineKind: "credit" }))).toBe(true);
		expect(isInvoicePaymentLine(row({ lineKind: "credit" }))).toBe(false);
	});

	it("compra e linha de extrato nao sao nem um nem outro", () => {
		expect(isInvoicePaymentLine(row({ lineKind: "purchase" }))).toBe(false);
		expect(isCreditLine(row({ lineKind: "purchase" }))).toBe(false);
		expect(isInvoicePaymentLine(row({ lineKind: undefined }))).toBe(false);
		expect(isCreditLine(row({ lineKind: undefined }))).toBe(false);
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

describe("initialRowName", () => {
	it("usa o nome aprendido quando a chave do descriptor está no de-para", () => {
		expect(
			initialRowName("CASA NOVA LOCADORA LTDA - EPP - Boleto", {
				"casa nova locadora ltda - epp - boleto": "Aluguel",
			}),
		).toBe("Aluguel");
	});

	it("cai no descriptor bruto quando não há nome aprendido", () => {
		expect(initialRowName("LOJA TESTE", {})).toBe("LOJA TESTE");
	});
});

describe("linkPeriodForRow", () => {
	it("usa o período da fatura quando o destino é cartão", () => {
		expect(
			linkPeriodForRow({
				date: "2026-07-28",
				destinationKind: "card",
				invoicePeriod: "2026-08",
			}),
		).toBe("2026-08");
	});

	it("deriva o período da data da linha quando o destino é conta", () => {
		expect(
			linkPeriodForRow({
				date: "2026-08-11",
				destinationKind: "account",
				invoicePeriod: "",
			}),
		).toBe("2026-08");
	});
});

describe("buildConsumedTransactionIds", () => {
	it("marca casadas e vínculos já escolhidos, guardando quem consumiu", () => {
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
		];

		const consumed = buildConsumedTransactionIds(rows, { "fp-2": "tx-2" });

		expect(consumed.get("tx-1")).toBe("fp-1");
		expect(consumed.get("tx-2")).toBe("fp-2");
	});
});

describe("listLinkCandidates", () => {
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

	it("lista só os lançamentos do período da linha", () => {
		const result = listLinkCandidates({
			transactions: [
				appTx({ id: "no-periodo" }),
				appTx({ id: "outro-periodo", period: "2026-07" }),
			],
			period: "2026-08",
			consumedBy: new Map(),
			fingerprint: "fp-1",
		});

		expect(result.map((c) => c.transaction.id)).toEqual(["no-periodo"]);
	});

	it("mantém visível o consumido por outra linha, marcado como indisponível", () => {
		const result = listLinkCandidates({
			transactions: [appTx({ id: "tx-1" }), appTx({ id: "tx-2" })],
			period: "2026-08",
			consumedBy: new Map([
				["tx-1", "outra-fp"],
				["tx-2", "fp-1"],
			]),
			fingerprint: "fp-1",
		});

		expect(result).toHaveLength(2);
		expect(result.find((c) => c.transaction.id === "tx-1")?.consumed).toBe(true);
		// o escolhido pela própria linha continua disponível para ela
		expect(result.find((c) => c.transaction.id === "tx-2")?.consumed).toBe(false);
	});
});

describe("evaluateApplyBlock", () => {
	it("não bloqueia quando não há criação sem nome", () => {
		expect(evaluateApplyBlock({ emptyNameCreationCount: 0 })).toEqual({
			blocked: false,
		});
	});

	it("bloqueia com o motivo à vista quando há criação sem nome", () => {
		const result = evaluateApplyBlock({ emptyNameCreationCount: 1 });
		expect(result.blocked).toBe(true);
		expect(result.blocked && result.reason).toMatch(/nome/);
	});

	it("divergência de valor não bloqueia: o alinhamento é automático", () => {
		expect(evaluateApplyBlock({ emptyNameCreationCount: 0 })).toEqual({
			blocked: false,
		});
	});
});

describe("buildReconciliationUndoPayload", () => {
	it("leva os valores anteriores do aplicar para o desfazer", () => {
		const applyResult = {
			success: true as const,
			importBatchId: "batch-1",
			created: 1,
			reconciled: [{ transactionId: "tx-1", fingerprint: "fp-1" }],
			ignored: 0,
			amountUpdates: [{ transactionId: "tx-1", previousAmount: "-20.00" }],
		};

		expect(buildReconciliationUndoPayload(applyResult)).toEqual({
			importBatchId: "batch-1",
			reconciled: [{ transactionId: "tx-1", fingerprint: "fp-1" }],
			amountUpdates: [{ transactionId: "tx-1", previousAmount: "-20.00" }],
		});
	});
});

describe("resolveAmountUpdate", () => {
	const candidato = (over: Partial<AppTransaction> = {}): AppTransaction => ({
		id: "tx-1",
		name: "Unimed Mãe",
		date: "2026-07-05",
		period: "2026-07",
		amount: 741.19,
		transactionType: "income",
		installmentCount: null,
		currentInstallment: null,
		fingerprint: null,
		isDivided: false,
		...over,
	});

	it("alinha o lancamento ao valor do arquivo quando os valores diferem", () => {
		expect(
			resolveAmountUpdate({
				candidate: candidato(),
				rowAmount: 1189.23,
				rowTransactionType: "income",
			}),
		).toEqual({
			transactionId: "tx-1",
			amount: 1189.23,
			transactionType: "income",
			isDivided: false,
		});
	});

	it("nao produz atualizacao quando os valores ja batem", () => {
		expect(
			resolveAmountUpdate({
				candidate: candidato({ amount: 1189.23 }),
				rowAmount: 1189.23,
				rowTransactionType: "income",
			}),
		).toBeNull();
	});

	it("nao produz atualizacao para lancamento dividido", () => {
		expect(
			resolveAmountUpdate({
				candidate: candidato({ isDivided: true }),
				rowAmount: 1189.23,
				rowTransactionType: "income",
			}),
		).toBeNull();
	});

	it("alinha diferenca de centavos vinda da tolerancia de parcela", () => {
		expect(
			resolveAmountUpdate({
				candidate: candidato({ amount: 86.61, transactionType: "expense" }),
				rowAmount: 86.59,
				rowTransactionType: "expense",
			}),
		).toEqual({
			transactionId: "tx-1",
			amount: 86.59,
			transactionType: "expense",
			isDivided: false,
		});
	});
});
