import type { ImportedTransaction } from "@/shared/lib/import/types";

/**
 * Fechamento de um dia contábil: a variação do Saldo do Dia contra a soma dos
 * lançamentos daquele dia.
 */
export type StatementDayClosure = {
	day: string; // YYYY-MM-DD, Data Contábil
	balance: number; // saldo do dia
	previousBalance: number; // saldo do dia contábil imediatamente anterior
	movement: number; // saldo[d] − saldo[d−1]
	entriesSum: number; // soma com sinal dos lançamentos do dia
	difference: number; // movement − entriesSum
	closes: boolean;
};

export type StatementClosureResult = {
	closes: boolean;
	days: StatementDayClosure[];
	/** Dias sem saldo anterior no arquivo — o primeiro, e os sem Saldo do Dia. */
	unverifiedDays: string[];
	divergences: StatementDayClosure[];
};

export type InvoiceClosureResult = {
	closes: boolean;
	purchasesSum: number;
	expectedTotal: number;
	difference: number; // expectedTotal − purchasesSum
};

function toCents(value: number): number {
	return Math.round(value * 100);
}

function fromCents(cents: number): number {
	return cents / 100;
}

function signedCents(transaction: ImportedTransaction): number {
	const cents = toCents(transaction.amount);
	return transaction.transactionType === "expense" ? -cents : cents;
}

/**
 * Verificação aritmética do extrato, independente do matcher: um dia que não
 * fecha é reportado ainda que todas as linhas tenham casado.
 */
export function checkStatementClosure(
	transactions: ImportedTransaction[],
): StatementClosureResult {
	const byDay = new Map<string, { sum: number; balance: number | null }>();

	for (const transaction of transactions) {
		const day = transaction.postedDate ?? transaction.date;
		const group = byDay.get(day) ?? { sum: 0, balance: null };
		group.sum += signedCents(transaction);
		if (group.balance === null && transaction.dayBalance !== undefined) {
			group.balance = toCents(transaction.dayBalance);
		}
		byDay.set(day, group);
	}

	const sortedDays = [...byDay.keys()].sort();
	const days: StatementDayClosure[] = [];
	const unverifiedDays: string[] = [];
	let previousBalance: number | null = null;

	for (const day of sortedDays) {
		const group = byDay.get(day);
		if (!group) continue;

		// Sem saldo do dia, ou sem saldo do dia anterior, não há o que comparar.
		if (group.balance === null || previousBalance === null) {
			unverifiedDays.push(day);
			previousBalance = group.balance;
			continue;
		}

		const movement = group.balance - previousBalance;
		const difference = movement - group.sum;

		days.push({
			day,
			balance: fromCents(group.balance),
			previousBalance: fromCents(previousBalance),
			movement: fromCents(movement),
			entriesSum: fromCents(group.sum),
			difference: fromCents(difference),
			closes: difference === 0,
		});

		previousBalance = group.balance;
	}

	const divergences = days.filter((day) => !day.closes);

	return {
		closes: divergences.length === 0,
		days,
		unverifiedDays,
		divergences,
	};
}

/**
 * Verificação aritmética da fatura: só as compras entram na soma. Pagamentos e
 * estornos ficam de fora, e o total do período vem de fora do arquivo — o CSV
 * do C6 não o traz.
 */
export function checkInvoiceClosure(
	transactions: ImportedTransaction[],
	expectedTotal: number,
): InvoiceClosureResult {
	// O total da fatura é positivo, e toda compra é despesa: soma-se a magnitude.
	const purchasesCents = transactions
		.filter((transaction) => transaction.isPurchase !== false)
		.reduce((total, transaction) => total + toCents(transaction.amount), 0);

	const expectedCents = toCents(expectedTotal);
	const difference = expectedCents - purchasesCents;

	return {
		closes: difference === 0,
		purchasesSum: fromCents(purchasesCents),
		expectedTotal: fromCents(expectedCents),
		difference: fromCents(difference),
	};
}
