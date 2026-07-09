import {
	PAYMENT_METHODS,
	TRANSACTION_CONDITIONS,
	TRANSACTION_TYPES,
} from "@/features/transactions/lib/constants";

export const INITIAL_BALANCE_CATEGORY_NAME = "Saldo inicial";
export const INITIAL_BALANCE_NOTE = "saldo inicial";

export const INITIAL_BALANCE_CONDITION =
	TRANSACTION_CONDITIONS.find((condition) => condition === "À vista") ??
	"À vista";
export const INITIAL_BALANCE_PAYMENT_METHOD =
	PAYMENT_METHODS.find((method) => method === "Pix") ?? "Pix";
export const INITIAL_BALANCE_TRANSACTION_TYPE =
	TRANSACTION_TYPES.find((type) => type === "Receita") ?? "Receita";

export const ACCOUNT_AUTO_INVOICE_NOTE_PREFIX = "AUTO_FATURA:";

export const buildInvoicePaymentNote = (cardId: string, period: string) =>
	`${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}${cardId}:${period}`;

// Prefixo comum a todos os lançamentos de pagamento (cheio e parciais) de uma
// fatura específica. Um pagamento parcial acrescenta um sufixo único a este
// prefixo, mantendo o prefixo `AUTO_FATURA:` para continuar sendo excluído de
// renda/despesa por `excludeAutoInvoiceEntries()`.
export const buildInvoicePaymentNotePrefix = (cardId: string, period: string) =>
	`${buildInvoicePaymentNote(cardId, period)}:`;

// Nota de um pagamento PARCIAL: `AUTO_FATURA:<cardId>:<period>:<shortId>`.
// O `shortId` garante unicidade entre múltiplos parciais da mesma fatura sem
// colidir com a nota exata (3 partes) do pagamento cheio.
export const buildPartialInvoicePaymentNote = (
	cardId: string,
	period: string,
	shortId: string,
) => `${buildInvoicePaymentNotePrefix(cardId, period)}${shortId}`;

// Reconhece a nota de um pagamento parcial de uma fatura específica: precisa
// começar pelo prefixo da fatura E ter conteúdo após o sufixo `:` (4ª parte),
// o que a distingue da nota do pagamento cheio (3 partes, sem sufixo).
export const isPartialInvoicePaymentNote = (
	note: string | null | undefined,
	cardId: string,
	period: string,
) => {
	const prefix = buildInvoicePaymentNotePrefix(cardId, period);
	return !!note && note.startsWith(prefix) && note.length > prefix.length;
};

export const INVOICE_ADJUSTMENT_NAME = "Ajuste de fatura";

export const ACCOUNT_BALANCE_ADJUSTMENT_NAME = "Ajuste de saldo";

export const REFUND_NOTE_PREFIX = "AUTO_REEMBOLSO:";

export const buildRefundNote = (originalTransactionId: string) =>
	`${REFUND_NOTE_PREFIX}${originalTransactionId}`;

export const isRefundNote = (note: string | null | undefined) =>
	note?.startsWith(REFUND_NOTE_PREFIX) ?? false;

export const isAccountInactive = (status: string | null | undefined) =>
	status?.toLowerCase() === "inativa";
