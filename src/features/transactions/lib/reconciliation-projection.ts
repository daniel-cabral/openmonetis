import type {
	ReconciliationApplyPayload,
} from "@/features/transactions/lib/reconciliation-review";
import type { AppTransaction } from "@/shared/lib/reconciliation/matcher";

/**
 * "in-balance": já conta no saldo base (dentro do arquivo, até o corte).
 * "unsettled": pendente no app, ainda não conta no saldo base.
 * "after-end": paga depois do fim do arquivo, fora do saldo base.
 */
export type BalanceStatus = "in-balance" | "unsettled" | "after-end";

/** Lançamento do admin pago depois do fim do arquivo; valor com sinal. */
export type PaidAfterEnd = {
	id: string;
	name: string;
	date: string;
	amount: number;
};

export type AccountBalanceContext = {
	cutoff: string;
	baseline: number;
	adminPayerId: string | null;
	/** Só candidatos do admin; id ausente não conta no saldo da conta. */
	statusById: Record<string, BalanceStatus>;
	paidAfterEnd: PaidAfterEnd[];
};

function toCents(value: number): number {
	return Math.round(value * 100);
}

function fromCents(cents: number): number {
	return cents / 100;
}

function signedCents(
	amount: number,
	transactionType: "income" | "expense",
): number {
	const cents = toCents(amount);
	return transactionType === "expense" ? -cents : cents;
}

export function projectAccountBalance({
	payload,
	context,
	appTransactionsById,
}: {
	payload: ReconciliationApplyPayload;
	context: AccountBalanceContext;
	appTransactionsById: Map<string, AppTransaction>;
}): { projected: number; paidAfterEnd: PaidAfterEnd[] } {
	let total = toCents(context.baseline);

	const updates = new Map(
		payload.amountUpdates
			.filter((update) => !update.isDivided)
			.map((update) => [update.transactionId, update] as const),
	);
	const kept = new Set([
		...payload.confirmations.map((confirmation) => confirmation.transactionId),
		...payload.manualLinks.map((manualLink) => manualLink.transactionId),
	]);

	for (const id of kept) {
		const status = context.statusById[id];
		const transaction = appTransactionsById.get(id);
		if (!status || !transaction) continue;

		const old = signedCents(transaction.amount, transaction.transactionType);
		const update = updates.get(id);
		const next = update
			? signedCents(update.amount, update.transactionType)
			: old;
		total += next - (status === "in-balance" ? old : 0);
	}

	for (const creation of payload.creations) {
		if (creation.payerId === context.adminPayerId) {
			total += signedCents(creation.amount, creation.transactionType);
		}
	}

	return {
		projected: fromCents(total),
		paidAfterEnd: context.paidAfterEnd.filter((paid) => !kept.has(paid.id)),
	};
}

/** Total da fatura previsto, positivo = valor a pagar. */
export function projectInvoiceTotal({
	payload,
	transactions,
	invoicePeriod,
}: {
	payload: ReconciliationApplyPayload;
	transactions: AppTransaction[];
	invoicePeriod: string;
}): number {
	const updates = new Map(
		payload.amountUpdates
			.filter((update) => !update.isDivided)
			.map((update) => [update.transactionId, update] as const),
	);

	let total = 0;
	for (const transaction of transactions) {
		if (transaction.period !== invoicePeriod) continue;

		const update = updates.get(transaction.id);
		const amount = update ? update.amount : transaction.amount;
		const transactionType = update
			? update.transactionType
			: transaction.transactionType;
		total += owedCents(amount, transactionType);
	}

	for (const creation of payload.creations) {
		total += owedCents(creation.amount, creation.transactionType);
	}

	return fromCents(total);
}

function owedCents(
	amount: number,
	transactionType: "income" | "expense",
): number {
	const cents = toCents(amount);
	return transactionType === "expense" ? cents : -cents;
}
