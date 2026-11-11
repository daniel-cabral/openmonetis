import { describe, expect, it } from "vitest";
import type {
	ReconciliationApplyPayload,
} from "@/features/transactions/lib/reconciliation-review";
import type { AppTransaction } from "@/shared/lib/reconciliation/matcher";
import {
	type AccountBalanceContext,
	projectAccountBalance,
	projectInvoiceTotal,
} from "./reconciliation-projection";

function tx(
	id: string,
	date: string,
	amount: number,
	transactionType: "income" | "expense" = "expense",
	period = "2026-10",
): AppTransaction {
	return {
		id,
		name: id,
		date,
		amount,
		transactionType,
		installmentCount: null,
		currentInstallment: null,
		fingerprint: null,
		period,
		isDivided: false,
	};
}

function payload(
	partial: Partial<ReconciliationApplyPayload>,
): ReconciliationApplyPayload {
	return {
		confirmations: [],
		creations: [],
		manualLinks: [],
		amountUpdates: [],
		ignores: [],
		...partial,
	};
}

function conf(transactionId: string) {
	return {
		fingerprint: `fp-${transactionId}`,
		transactionId,
		descriptor: "descricao",
	};
}

function link(transactionId: string) {
	return {
		fingerprint: `fp-${transactionId}`,
		transactionId,
		descriptor: "descricao",
		name: transactionId,
	};
}

function upd(
	transactionId: string,
	amount: number,
	transactionType: "income" | "expense" = "expense",
) {
	return { transactionId, amount, transactionType, isDivided: false };
}

function creation(
	amount: number,
	transactionType: "income" | "expense",
	payerId: string,
) {
	return {
		fingerprint: "fp-nova",
		date: "2026-10-11",
		amount,
		transactionType,
		descriptor: "descricao",
		name: "nova",
		categoryId: null,
		subcategoryId: null,
		payerId,
	};
}

const transactions: AppTransaction[] = [
	tx("terapia", "2026-10-11", 275),
	tx("danielle", "2026-10-16", 210),
	tx("colegio", "2026-10-22", 1643),
	tx("mensalidade", "2026-11-22", 1643),
	tx("outro", "2026-10-20", 90),
	{ ...tx("dividido", "2026-10-21", 300), isDivided: true },
];

const appTransactionsById = new Map<string, AppTransaction>(
	transactions.map((transaction) => [transaction.id, transaction] as const),
);

const context: AccountBalanceContext = {
	cutoff: "2026-11-11",
	baseline: 1118.44,
	adminPayerId: "payer-admin",
	statusById: {
		terapia: "in-balance",
		danielle: "unsettled",
		colegio: "in-balance",
		mensalidade: "after-end",
		dividido: "in-balance",
	},
	paidAfterEnd: [
		{
			id: "mensalidade",
			name: "Mensalidade Colégio Santo Agostinho",
			date: "2026-11-22",
			amount: -1643,
		},
	],
};

describe("projectAccountBalance", () => {
	const cases: [string, Partial<ReconciliationApplyPayload>, number][] = [
		[
			"manter Fernanda com Terapia não muda o saldo",
			{ confirmations: [conf("terapia")] },
			1118.44,
		],
		[
			"desfazer Fernanda e criar o débito fecha em 843,44",
			{ creations: [creation(275, "expense", "payer-admin")] },
			843.44,
		],
		[
			"criação para outra pessoa não entra no saldo",
			{ creations: [creation(275, "expense", "payer-other")] },
			1118.44,
		],
		[
			"confirmar Danielle pendente desconta 210",
			{ confirmations: [conf("danielle")] },
			908.44,
		],
		[
			"alinhar Colégio de 1.643 para 1.560,85 soma a diferença",
			{
				confirmations: [conf("colegio")],
				amountUpdates: [upd("colegio", 1560.85)],
			},
			1200.59,
		],
		[
			"vínculo de lançamento de outra pessoa não entra no saldo",
			{ manualLinks: [link("outro")] },
			1118.44,
		],
		[
			"alinhamento em lançamento dividido é ignorado",
			{
				confirmations: [conf("dividido")],
				amountUpdates: [{ ...upd("dividido", 250), isDivided: true }],
			},
			1118.44,
		],
		[
			"Pular e Ignorar não mexem no saldo",
			{ ignores: [{ fingerprint: "fp-x", reason: "Não lançável" }] },
			1118.44,
		],
	];

	it.each(cases)("%s", (_, partial, expected) => {
		expect(
			projectAccountBalance({
				payload: payload(partial),
				context,
				appTransactionsById,
			}).projected,
		).toBe(expected);
	});

	it("lista a mensalidade paga depois do fim do arquivo até ser casada", () => {
		const pending = projectAccountBalance({
			payload: payload({}),
			context,
			appTransactionsById,
		});
		expect(pending.paidAfterEnd.map((paid) => paid.id)).toEqual([
			"mensalidade",
		]);

		const matched = projectAccountBalance({
			payload: payload({ confirmations: [conf("mensalidade")] }),
			context,
			appTransactionsById,
		});
		expect(matched).toEqual({ projected: -524.56, paidAfterEnd: [] });
	});
});

describe("projectInvoiceTotal", () => {
	it("projeta o total da fatura com criação e alinhamento de valor", () => {
		const invoice = [
			tx("a", "2026-11-03", 100, "expense", "2026-11"),
			tx("b", "2026-11-05", 50, "expense", "2026-11"),
			tx("c", "2026-11-07", 20, "income", "2026-11"),
			tx("d", "2026-10-20", 999, "expense", "2026-10"),
		];

		const total = projectInvoiceTotal({
			payload: payload({
				creations: [creation(30, "expense", "payer-admin")],
				amountUpdates: [upd("b", 55)],
			}),
			transactions: invoice,
			invoicePeriod: "2026-11",
		});

		expect(total).toBe(165);
	});
});
