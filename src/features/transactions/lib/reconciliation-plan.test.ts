import { describe, expect, it } from "vitest";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
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
	descriptor: "ABC SUPERMERCADOS CONTAGEM BRA",
	name: "Mercado",
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

describe("buildReconciliationPlan — descriptor, nome e de-para de nome", () => {
	it("chaveia o de-para pelo descriptor bruto, nunca pelo nome digitado", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			creations: [
				{
					...CREATION,
					descriptor: "CASA NOVA LOCADORA LTDA - EPP - Boleto",
					name: "Aluguel",
				},
			],
		});

		expect(plan.inserts[0]?.name).toBe("Aluguel");
		expect(plan.nameMappings).toEqual([
			{
				userId: "user-1",
				descriptionKey: normalizeDescriptionKey(
					"CASA NOVA LOCADORA LTDA - EPP - Boleto",
				),
				name: "Aluguel",
			},
		]);
		expect(plan.nameMappings[0]?.descriptionKey).not.toBe("aluguel");
	});

	it("não aprende nome de criação quando o destino é cartão", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			destination: { type: "card", id: "card-1" },
			paymentMethod: "Cartão de crédito",
			invoicePeriod: "2026-09",
			creations: [{ ...CREATION, name: "Uber - aeroporto" }],
		});

		expect(plan.inserts[0]?.name).toBe("Uber - aeroporto");
		expect(plan.nameMappings).toEqual([]);
	});

	it("ignora criação com nome vazio ou descriptor vazio no de-para", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			creations: [
				{ ...CREATION, fingerprint: "fp-1", name: "   " },
				{ ...CREATION, fingerprint: "fp-2", descriptor: "   " },
			],
		});

		expect(plan.nameMappings).toEqual([]);
	});

	it("vínculo manual concilia e aprende o nome do lançamento em conta", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			manualLinks: [
				{
					fingerprint: "fp-link",
					transactionId: "transaction-7",
					descriptor: "CASA NOVA LOCADORA LTDA - EPP - Boleto",
					name: "Aluguel",
				},
			],
		});

		expect(plan.fingerprintUpdates).toEqual([
			{ transactionId: "transaction-7", fingerprint: "fp-link" },
		]);
		expect(plan.nameMappings).toEqual([
			{
				userId: "user-1",
				descriptionKey: normalizeDescriptionKey(
					"CASA NOVA LOCADORA LTDA - EPP - Boleto",
				),
				name: "Aluguel",
			},
		]);
	});

	// 5.3 manda aprender do vínculo manual em qualquer destino, e D6 diz que na
	// fatura o de-para se alimenta só dele. A frase de 5.6 ("sem aprender em
	// cartão") repete o parêntese equivocado de D9 e é a que cede.
	it("vínculo manual em cartão concilia e também aprende o de-para", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			destination: { type: "card", id: "card-1" },
			paymentMethod: "Cartão de crédito",
			invoicePeriod: "2026-09",
			manualLinks: [
				{
					fingerprint: "fp-link",
					transactionId: "transaction-7",
					descriptor: "UBER *TRIP SAO PAULO BRA",
					name: "Uber BC",
				},
			],
		});

		expect(plan.fingerprintUpdates).toEqual([
			{ transactionId: "transaction-7", fingerprint: "fp-link" },
		]);
		expect(plan.nameMappings).toEqual([
			{
				userId: "user-1",
				descriptionKey: normalizeDescriptionKey("UBER *TRIP SAO PAULO BRA"),
				name: "Uber BC",
			},
		]);
	});

	it("casamento automático não alimenta o de-para de nome", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			confirmations: [
				{
					fingerprint: "fp-match",
					transactionId: "transaction-1",
					descriptor: "CASA NOVA LOCADORA LTDA - EPP - Boleto",
					categoryId: "category-9",
				},
			],
		});

		expect(plan.nameMappings).toEqual([]);
		expect(plan.categoryMappings).toHaveLength(1);
	});

	it("colapsa chaves repetidas do de-para de nome num registro só", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			creations: [
				{ ...CREATION, fingerprint: "fp-1", descriptor: "DROGASIL2919", name: "Farmácia" },
			],
			manualLinks: [
				{
					fingerprint: "fp-2",
					transactionId: "transaction-2",
					descriptor: "DROGASIL 4471",
					name: "Remédios",
				},
			],
		});

		expect(plan.nameMappings).toEqual([
			{ userId: "user-1", descriptionKey: "drogasil", name: "Remédios" },
		]);
	});
});

describe("buildReconciliationPlan — atualização de valor", () => {
	it("produz o update assinado a partir da escolha de atualizar", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			amountUpdates: [
				{
					transactionId: "transaction-1",
					amount: 1234.5,
					transactionType: "expense",
					isDivided: false,
				},
			],
		});

		expect(plan.amountUpdates).toEqual([
			{ transactionId: "transaction-1", amount: "-1234.50" },
		]);
	});

	it("escolha manter não gera amountUpdate", () => {
		const plan = buildReconciliationPlan({ ...BASE, amountUpdates: [] });

		expect(plan.amountUpdates).toEqual([]);
	});

	it("lançamento dividido não gera amountUpdate", () => {
		const plan = buildReconciliationPlan({
			...BASE,
			amountUpdates: [
				{
					transactionId: "transaction-1",
					amount: 1234.5,
					transactionType: "expense",
					isDivided: true,
				},
			],
		});

		expect(plan.amountUpdates).toEqual([]);
	});
});
