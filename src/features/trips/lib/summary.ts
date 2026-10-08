export type TripTransactionRow = {
	id: string;
	name: string;
	purchaseDate: string;
	amount: number;
	transactionType: string;
	payerId: string | null;
	payerName: string | null;
	categoryName: string | null;
	cardName: string | null;
	accountName: string | null;
	currentInstallment: number | null;
	installmentCount: number | null;
	seriesId: string | null;
	splitGroupId: string | null;
};

export type TripBreakdownItem = { label: string; amount: number };

export type TripSummary = {
	netCost: number;
	expenses: number;
	reimbursements: number;
	byCategory: TripBreakdownItem[];
	bySource: TripBreakdownItem[];
	byPayer: TripBreakdownItem[];
};

const toCents = (value: number) => Math.round(value * 100);

const addTo = (map: Map<string, number>, key: string, cents: number) => {
	map.set(key, (map.get(key) ?? 0) + cents);
};

const toItems = (map: Map<string, number>): TripBreakdownItem[] =>
	[...map]
		.map(([label, cents]) => ({ label, amount: cents / 100 }))
		.sort(
			(a, b) => b.amount - a.amount || a.label.localeCompare(b.label, "pt-BR"),
		);

// Net cost of the admin: expenses minus linked income (refunds), paid or not (D6).
// Breakdown by person includes every payer's expenses.
export function summarizeTrip(
	rows: TripTransactionRow[],
	adminPayerId: string | null,
): TripSummary {
	let expenseCents = 0;
	let reimbursementCents = 0;
	const byCategory = new Map<string, number>();
	const bySource = new Map<string, number>();
	const byPayer = new Map<string, number>();

	for (const row of rows) {
		const cents = toCents(row.amount);
		const isExpense = row.transactionType === "Despesa";

		if (isExpense) addTo(byPayer, row.payerName ?? "Sem pessoa", -cents);
		if (!adminPayerId || row.payerId !== adminPayerId) continue;

		if (isExpense) {
			expenseCents += -cents;
			addTo(byCategory, row.categoryName ?? "Sem categoria", -cents);
			addTo(
				bySource,
				row.cardName ?? row.accountName ?? "Sem cartão ou conta",
				-cents,
			);
		} else if (row.transactionType === "Receita") {
			reimbursementCents += cents;
		}
	}

	return {
		netCost: (expenseCents - reimbursementCents) / 100,
		expenses: expenseCents / 100,
		reimbursements: reimbursementCents / 100,
		byCategory: toItems(byCategory),
		bySource: toItems(bySource),
		byPayer: toItems(byPayer),
	};
}
