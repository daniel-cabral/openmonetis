export type ImportedTransaction = {
	externalId: string | null; // FITID do OFX
	externalIdOccurrence: number; // posição entre registros OFX idênticos
	date: string; // YYYY-MM-DD
	amount: number; // positivo = receita, negativo = despesa
	description: string; // MEMO ou NAME
	sourceDescription: string; // descrição original, preservada para deduplicação
	transactionType: "income" | "expense";
	categoryRaw?: string | null;
	postedDate?: string; // YYYY-MM-DD, data contábil (quando difere da data de lançamento)
	dayBalance?: number; // saldo do dia, usado no fechamento aritmético do extrato
	installment?: { number: number; total: number }; // parcela N/M da fatura
	cardLast4?: string; // últimos 4 dígitos do cartão (fatura)
	holderName?: string; // titular do cartão (fatura)
	fx?: { currency: string; amount: number }; // valor em moeda estrangeira, quando houver
	isPurchase?: boolean; // false para linhas de pagamento/estorno na fatura
	lineKind?: "purchase" | "credit" | "invoice-payment"; // classificação da linha na fatura
};

export type ImportStatement = {
	source: string; // nome do banco (ORG)
	accountNumber: string | null; // ACCTID
	period: { from: string; to: string } | null; // YYYY-MM-DD
	isCreditCard: boolean; // true = CREDITCARDMSGSRSV1
	transactions: ImportedTransaction[];
};
