import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import type { ImportedTransaction } from "@/shared/lib/import/types";
import {
	checkInvoiceClosure,
	checkStatementClosure,
	type InvoiceClosureResult,
	type StatementClosureResult,
} from "@/shared/lib/reconciliation/closure";
import type {
	AppTransaction,
	DestinationKind,
	ReconciliationMatch,
	RowClassification,
} from "@/shared/lib/reconciliation/matcher";
import { normalizeDecimalInput } from "@/shared/utils/currency";
import { derivePeriodFromDate } from "@/shared/utils/period";

/** Contagem por balde, para o resumo da revisão. */
export type ReconciliationSummary = {
	matched: number;
	bankOnly: number;
	appOnly: number;
	ambiguous: number;
};

export function summarizeReconciliationMatch(
	match: ReconciliationMatch,
): ReconciliationSummary {
	return match.rows.reduce<ReconciliationSummary>(
		(summary, row) => {
			if (row.status === "matched") summary.matched += 1;
			else if (row.status === "bank-only") summary.bankOnly += 1;
			else if (row.status === "ambiguous") summary.ambiguous += 1;
			return summary;
		},
		{ matched: 0, bankOnly: 0, appOnly: match.appOnlyIds.length, ambiguous: 0 },
	);
}

/** Decisão do usuário para uma linha da revisão. */
export type ReconciliationRowDecision =
	| { action: "confirm"; transactionId: string; descriptor: string }
	| {
			action: "create";
			date: string;
			amount: number;
			transactionType: "income" | "expense";
			/** Texto bruto do arquivo, chave do de-para — nunca o nome digitado. */
			descriptor: string;
			/** Nome do lançamento, editável na revisão. */
			name: string;
			categoryId: string | null;
			payerId: string | null;
	  }
	| {
			action: "link";
			transactionId: string;
			/** Texto bruto do arquivo, chave do de-para — nunca o nome digitado. */
			descriptor: string;
			/** Nome do lançamento vinculado, o que o de-para aprende. */
			name: string;
	  }
	| { action: "ignore"; reason: string }
	| { action: "skip" };

export type ReconciliationApplyPayload = {
	confirmations: {
		fingerprint: string;
		transactionId: string;
		descriptor: string;
	}[];
	creations: {
		fingerprint: string;
		date: string;
		amount: number;
		transactionType: "income" | "expense";
		descriptor: string;
		name: string;
		categoryId: string | null;
		payerId: string;
	}[];
	manualLinks: {
		fingerprint: string;
		transactionId: string;
		descriptor: string;
		name: string;
	}[];
	ignores: { fingerprint: string; reason: string }[];
};

/**
 * Traduz as decisões tomadas na tela de revisão nos três arrays que a action
 * de aplicação espera. Linhas puladas (`skip`) simplesmente não entram em
 * nenhum array — nada é escrito para elas.
 */
export function buildReconciliationApplyPayload(
	entries: { fingerprint: string; decision: ReconciliationRowDecision }[],
	defaultPayerId: string,
): ReconciliationApplyPayload {
	const payload: ReconciliationApplyPayload = {
		confirmations: [],
		creations: [],
		manualLinks: [],
		ignores: [],
	};

	for (const { fingerprint, decision } of entries) {
		if (decision.action === "confirm") {
			payload.confirmations.push({
				fingerprint,
				transactionId: decision.transactionId,
				descriptor: decision.descriptor,
			});
		} else if (decision.action === "create") {
			payload.creations.push({
				fingerprint,
				date: decision.date,
				amount: decision.amount,
				transactionType: decision.transactionType,
				descriptor: decision.descriptor,
				name: decision.name,
				categoryId: decision.categoryId,
				payerId: decision.payerId ?? defaultPayerId,
			});
		} else if (decision.action === "link") {
			payload.manualLinks.push({
				fingerprint,
				transactionId: decision.transactionId,
				descriptor: decision.descriptor,
				name: decision.name,
			});
		} else if (decision.action === "ignore") {
			payload.ignores.push({ fingerprint, reason: decision.reason });
		}
	}

	return payload;
}

/** Linha da fatura que não é compra (pagamento ou estorno): vai para o balde informativo, sem ação. */
export function isNonPurchaseLine(row: ImportedTransaction): boolean {
	return row.lineKind !== undefined && row.lineKind !== "purchase";
}

/**
 * Escopo do balde "só no app": no cartão o lançamento pertence ao período da
 * fatura, não ao mês da compra; na conta o intervalo real do arquivo basta.
 */
export function filterAppOnlyByScope(
	transactions: AppTransaction[],
	scope:
		| { destinationKind: Extract<DestinationKind, "account">; from: string; to: string }
		| { destinationKind: Extract<DestinationKind, "card">; invoicePeriod: string },
): AppTransaction[] {
	if (scope.destinationKind === "card") {
		return transactions.filter((tx) => tx.period === scope.invoicePeriod);
	}
	return transactions.filter((tx) => tx.date >= scope.from && tx.date <= scope.to);
}

export type ReconciliationClosure =
	| { kind: "statement"; result: StatementClosureResult }
	| { kind: "invoice"; result: InvoiceClosureResult };

/**
 * Deriva o fechamento aritmético a partir do que já está em memória — nada é
 * rebuscado no servidor. Para fatura, sem total informado não há o que
 * fechar; para o total mudar depois de avançar basta recalcular esta função.
 */
export function deriveReconciliationClosure(params: {
	profileKind: string | undefined;
	transactions: ImportedTransaction[];
	invoiceTotalInput: string;
}): ReconciliationClosure | null {
	const { profileKind, transactions, invoiceTotalInput } = params;

	if (profileKind !== "invoice") {
		return { kind: "statement", result: checkStatementClosure(transactions) };
	}

	if (!invoiceTotalInput) return null;

	return {
		kind: "invoice",
		result: checkInvoiceClosure(
			transactions,
			Number(normalizeDecimalInput(invoiceTotalInput)),
		),
	};
}

/**
 * Nome pré-preenchido da linha do balde "só no banco": o aprendido quando a
 * chave do descriptor já foi ensinada, o descriptor bruto quando não.
 */
export function initialRowName(
	descriptor: string,
	nameMappings: Record<string, string>,
): string {
	return nameMappings[normalizeDescriptionKey(descriptor)] ?? descriptor;
}

/**
 * Período usado para listar os candidatos ao vínculo manual: na fatura o
 * lançamento pertence ao período da fatura, no extrato ao mês da própria linha.
 */
export function linkPeriodForRow(params: {
	date: string;
	destinationKind: DestinationKind | null;
	invoicePeriod: string;
}): string {
	return params.destinationKind === "card"
		? params.invoicePeriod
		: derivePeriodFromDate(params.date);
}

/**
 * Lançamentos já consumidos por alguma linha, mapeados para o fingerprint que
 * os consumiu — guardar a origem deixa o próprio escolhido disponível para a
 * linha que o escolheu.
 */
export function buildConsumedTransactionIds(
	rows: RowClassification[],
	linkedByFingerprint: Record<string, string | null>,
): Map<string, string> {
	const consumed = new Map<string, string>();

	for (const row of rows) {
		if (row.status === "matched") consumed.set(row.transactionId, row.fingerprint);
	}
	for (const [fingerprint, transactionId] of Object.entries(linkedByFingerprint)) {
		if (transactionId) consumed.set(transactionId, fingerprint);
	}

	return consumed;
}

export type LinkCandidate = { transaction: AppTransaction; consumed: boolean };

/**
 * Candidatos ao vínculo manual: os lançamentos do destino no período da linha,
 * com os já consumidos por outra linha visíveis e marcados — escondê-los faria
 * o usuário concluir que o lançamento não existe e criar um duplicado.
 */
export function listLinkCandidates(params: {
	transactions: AppTransaction[];
	period: string;
	consumedBy: Map<string, string>;
	fingerprint: string;
}): LinkCandidate[] {
	return params.transactions
		.filter((tx) => tx.period === params.period)
		.map((transaction) => {
			const consumedByFingerprint = params.consumedBy.get(transaction.id);
			return {
				transaction,
				consumed:
					consumedByFingerprint !== undefined &&
					consumedByFingerprint !== params.fingerprint,
			};
		});
}
