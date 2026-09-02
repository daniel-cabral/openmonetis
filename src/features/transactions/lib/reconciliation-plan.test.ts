import { describe, expect, it } from "vitest";
import {
	buildReconciliationPlan,
	type ReconciliationPlanInput,
} from "@/features/transactions/lib/reconciliation-plan";

const BASE: ReconciliationPlanInput = {
	userId: "user-1",
	importBatchId: "batch-1",
	destination: { type: "account", id: "account-1" },
	paymentMethod: "Débito",
	invoicePeriod: null,
	confirmations: [],
	creations: [],
	ignores: [],
};

const CREATION = {
	fingerprint: "fp-create",
	date: "2026-08-14",
	amount: 86.59,
	transactionType: "expense" as const,
	description: "Mercado",
	categoryId: "category-1",
	payerId: "payer-1",
};

describe("buildReconciliationPlan", () => {
	it("transforma linha a criar em lançamento do lote com valor assinado", () => {
		const plan = buildReconciliationPlan({ ...BASE, creations: [CREATION] });

		expect(plan.inserts).toHaveLength(1);
		expect(plan.inserts[0]).toMatchObject({
			name: "Mercado",
			transactionType: "Despesa",
			amount: "-86.59",
			period: "2026-08",
			userId: "user-1",
			payerId: "payer-1",
			categoryId: "category-1",
			accountId: "account-1",
			cardId: null,
			ofxImportFingerprint: "fp-create",
			importBatchId: "batch-1",
			isSettled: true,
		});
		expect(plan.fingerprintUpdates).toEqual([]);
	});

	it("usa o período da fatura quando informado, em vez do derivado da data", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			destination: { type: "card", id: "card-1" },
			paymentMethod: "Cartão de crédito",
			invoicePeriod: "2026-09",
			creations: [CREATION],
		});

		expect(plan.inserts[0]).toMatchObject({
			period: "2026-09",
			accountId: null,
			cardId: "card-1",
			isSettled: false,
		});
	});

	it("confirmação só grava fingerprint no lançamento preexistente", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			confirmations: [
				{
					fingerprint: "fp-match",
					transactionId: "transaction-1",
					descriptor: "PG *ABC SUPERMERCADOS CONTAGEM BRA",
					categoryId: null,
				},
			],
		});

		expect(plan.inserts).toEqual([]);
		expect(plan.fingerprintUpdates).toEqual([
			{ transactionId: "transaction-1", fingerprint: "fp-match" },
		]);
		expect(plan.categoryMappings).toEqual([]);
	});

	it("confirmação com categoria alimenta o de-para com o descriptor normalizado", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			confirmations: [
				{
					fingerprint: "fp-match",
					transactionId: "transaction-1",
					descriptor: "PG *ABC SUPERMERCADOS CONTAGEM BRA",
					categoryId: "category-9",
				},
			],
		});

		expect(plan.categoryMappings).toEqual([
			{
				userId: "user-1",
				descriptionKey: "abc supermercados",
				categoryId: "category-9",
			},
		]);
	});

	it("colapsa confirmações que normalizam para o mesmo descriptor", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			confirmations: [
				{
					fingerprint: "fp-1",
					transactionId: "transaction-1",
					descriptor: "DROGASIL2919",
					categoryId: "category-1",
				},
				{
					fingerprint: "fp-2",
					transactionId: "transaction-2",
					descriptor: "DROGASIL 4471",
					categoryId: "category-2",
				},
			],
		});

		expect(plan.categoryMappings).toEqual([
			{
				userId: "user-1",
				descriptionKey: "drogasil",
				categoryId: "category-2",
			},
		]);
		expect(plan.fingerprintUpdates).toHaveLength(2);
	});

	it("ignora descriptor vazio ao alimentar o de-para", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			confirmations: [
				{
					fingerprint: "fp-match",
					transactionId: "transaction-1",
					descriptor: "   ",
					categoryId: "category-9",
				},
			],
		});

		expect(plan.categoryMappings).toEqual([]);
		expect(plan.fingerprintUpdates).toHaveLength(1);
	});

	it("linha ignorada vira registro com motivo, sem lançamento", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			ignores: [{ fingerprint: "fp-ignore", reason: "Pagamento de fatura" }],
		});

		expect(plan.ignores).toEqual([
			{
				userId: "user-1",
				fingerprint: "fp-ignore",
				reason: "Pagamento de fatura",
			},
		]);
		expect(plan.inserts).toEqual([]);
	});
});
