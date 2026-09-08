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
	| {
			action: "confirm";
			transactionId: string;
			descriptor: string;
			/** Escolha explícita de atualizar o valor do lançamento ao do arquivo. */
			amountUpdate?: {
				amount: number;
				transactionType: "income" | "expense";
				isDivided: boolean;
			};
	  }
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
			/** Alinhamento do valor ao do arquivo, quando eles divergem. */
			amountUpdate?: {
				amount: number;
				transactionType: "income" | "expense";
				isDivided: boolean;
			};
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
	amountUpdates: {
		transactionId: string;
		amount: number;
		transactionType: "income" | "expense";
		isDivided: boolean;
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
		amountUpdates: [],
		ignores: [],
	};

	for (const { fingerprint, decision } of entries) {
		if (decision.action === "confirm") {
			payload.confirmations.push({
				fingerprint,
				transactionId: decision.transactionId,
				descriptor: decision.descriptor,
			});
			if (decision.amountUpdate) {
				payload.amountUpdates.push({
					transactionId: decision.transactionId,
					amount: decision.amountUpdate.amount,
					transactionType: decision.amountUpdate.transactionType,
					isDivided: decision.amountUpdate.isDivided,
				});
			}
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
			if (decision.amountUpdate) {
				payload.amountUpdates.push({
					transactionId: decision.transactionId,
					amount: decision.amountUpdate.amount,
					transactionType: decision.amountUpdate.transactionType,
					isDivided: decision.amountUpdate.isDivided,
				});
			}
		} else if (decision.action === "ignore") {
			payload.ignores.push({ fingerprint, reason: decision.reason });
		}
	}

	return payload;
}

/**
 * Monta o payload do desfazer a partir do retorno do aplicar. O desfazer só
 * restaura os valores sobrescritos se receber os `amountUpdates` devolvidos —
 * montar o payload aqui mantém essa costura sob teste.
 */
export function buildReconciliationUndoPayload(result: {
	importBatchId: string;
	reconciled: { transactionId: string; fingerprint: string }[];
	amountUpdates: { transactionId: string; previousAmount: string }[];
}): {
	importBatchId: string;
	reconciled: { transactionId: string; fingerprint: string }[];
	amountUpdates: { transactionId: string; previousAmount: string }[];
} {
	return {
		importBatchId: result.importBatchId,
		reconciled: result.reconciled,
		amountUpdates: result.amountUpdates,
	};
}

/**
 * Pagamento da fatura **anterior** (`Pag Fatura Boleto`). Não pertence a esta
 * fatura e já é despesa da conta corrente: lançá-lo duplicaria a saída.
 */
export function isInvoicePaymentLine(row: ImportedTransaction): boolean {
	return row.lineKind === "invoice-payment";
}

/**
 * Crédito **desta** fatura — adiantamento (`Inclusao de Pagamento`) ou estorno.
 * Abate o valor da fatura, então pode virar lançamento de receita no cartão.
 * Sem ele, o app soma só as compras e acha um saldo devedor maior que o real.
 */
export function isCreditLine(row: ImportedTransaction): boolean {
	return row.lineKind === "credit";
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

/** Resultado da avaliação do bloqueio do botão "Aplicar". */
export type ApplyBlock = { blocked: false } | { blocked: true; reason: string };

/**
 * Bloqueia o "Aplicar" enquanto houver linha marcada para criação com nome
 * vazio, com o motivo visível na tela. Divergência de valor não bloqueia mais:
 * o arquivo é a autoridade e o alinhamento é automático, apenas anunciado.
 */
export function evaluateApplyBlock(params: {
	emptyNameCreationCount: number;
}): ApplyBlock {
	const reasons: string[] = [];

	if (params.emptyNameCreationCount > 0) {
		reasons.push(`${params.emptyNameCreationCount} criação(ões) sem nome`);
	}

	if (reasons.length === 0) return { blocked: false };
	return { blocked: true, reason: reasons.join(" · ") };
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

/**
 * O valor a gravar no lançamento casado. O arquivo do banco é a autoridade: o
 * que o usuário lançou pode ser estimativa de um recorrente, e manter a
 * estimativa depois de conhecer o valor cobrado distorce o orçamento.
 *
 * Devolve `null` quando não há o que alinhar — valores já iguais — ou quando o
 * lançamento é dividido, caso em que o valor vive distribuído entre as partes
 * por pagador e mexer só no total deixaria a soma inconsistente.
 */
export function resolveAmountUpdate(params: {
	candidate: AppTransaction;
	rowAmount: number;
	rowTransactionType: "income" | "expense";
}): {
	transactionId: string;
	amount: number;
	transactionType: "income" | "expense";
	isDivided: boolean;
} | null {
	if (params.candidate.isDivided) return null;
	if (
		Math.round(params.candidate.amount * 100) ===
		Math.round(params.rowAmount * 100)
	) {
		return null;
	}

	return {
		transactionId: params.candidate.id,
		amount: params.rowAmount,
		transactionType: params.rowTransactionType,
		isDivided: false,
	};
}
