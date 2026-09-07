import type { ReconciliationMatch } from "@/shared/lib/reconciliation/matcher";

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
		} else if (decision.action === "ignore") {
			payload.ignores.push({ fingerprint, reason: decision.reason });
		}
	}

	return payload;
}
