import type { AppTransaction } from "@/shared/lib/reconciliation/matcher";
import { toDateOnlyString } from "@/shared/utils/date";
import type { BalanceStatus } from "./reconciliation-projection";

/** Linha crua de `transactions` lida pela action de candidatos. */
export type ReconciliationCandidateRow = {
	id: string;
	name: string;
	purchaseDate: Date | string | null;
	amount: string | number;
	transactionType: string;
	installmentCount: number | null;
	currentInstallment: number | null;
	ofxImportFingerprint: string | null;
	period: string;
	isDivided: boolean | null;
};

/**
 * Traduz a linha do banco para o formato que o matcher compara. É costura, não
 * detalhe: a coluna `tipo_transacao` guarda "Despesa"/"Receita", enquanto o
 * matcher raciocina em "expense"/"income" — tratar uma como a outra faria todo
 * lançamento do app virar valor positivo e nenhuma despesa casaria.
 */
export function toAppTransaction(
	row: ReconciliationCandidateRow,
): AppTransaction {
	return {
		id: row.id,
		name: row.name,
		date: toDateOnlyString(row.purchaseDate) ?? "",
		amount: Math.abs(Number(row.amount)),
		transactionType: row.transactionType === "Receita" ? "income" : "expense",
		installmentCount: row.installmentCount ?? null,
		currentInstallment: row.currentInstallment ?? null,
		fingerprint: row.ofxImportFingerprint ?? null,
		period: row.period,
		isDivided: row.isDivided ?? false,
	};
}

/**
 * Situação do candidato no saldo base da conta. `null` quando o lançamento
 * não é do admin (não entra no saldo da conta). Pendente vem antes da data:
 * um lançamento não liquidado nunca conta, qualquer que seja a data.
 */
export function toBalanceStatus(
	row: {
		isSettled: boolean | null;
		payerId: string | null;
		purchaseDate: Date | string | null;
	},
	context: { adminPayerId: string | null; cutoff: string },
): BalanceStatus | null {
	if (!context.adminPayerId || row.payerId !== context.adminPayerId) {
		return null;
	}

	if (!row.isSettled) {
		return "unsettled";
	}

	const date = toDateOnlyString(row.purchaseDate) ?? "";
	return date > context.cutoff ? "after-end" : "in-balance";
}
