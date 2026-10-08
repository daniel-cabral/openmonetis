export const SUGGESTIONS_PAGE_SIZE = 20;

export type SuggestionSourceRow = {
	id: string;
	cardId: string | null;
	cardName: string | null;
	accountId: string | null;
	accountName: string | null;
};

// "all" | "cards" | "accounts" | "card:<id>" | "account:<id>"
export type SuggestionSource = string;

export type SourceOption = { value: SuggestionSource; label: string };

export function filterBySource<T extends SuggestionSourceRow>(
	rows: T[],
	source: SuggestionSource,
): T[] {
	if (source === "all") return rows;
	if (source === "cards") return rows.filter((row) => row.cardId);
	if (source === "accounts") return rows.filter((row) => row.accountId);
	if (source.startsWith("card:")) {
		const id = source.slice("card:".length);
		return rows.filter((row) => row.cardId === id);
	}
	if (source.startsWith("account:")) {
		const id = source.slice("account:".length);
		return rows.filter((row) => row.accountId === id);
	}
	return rows;
}

export function buildSourceOptions(
	rows: SuggestionSourceRow[],
): SourceOption[] {
	const sources = new Map<string, string>();
	for (const row of rows) {
		if (row.cardId) sources.set(`card:${row.cardId}`, row.cardName ?? "Cartão");
		if (row.accountId)
			sources.set(`account:${row.accountId}`, row.accountName ?? "Conta");
	}
	const specific = [...sources.entries()]
		.map(([value, label]) => ({ value, label }))
		.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
	return [
		{ value: "all", label: "Todos" },
		{ value: "cards", label: "Só cartões" },
		{ value: "accounts", label: "Só contas" },
		...specific,
	];
}

export function paginate<T>(items: T[], page: number) {
	const total = items.length;
	const pageCount = Math.max(1, Math.ceil(total / SUGGESTIONS_PAGE_SIZE));
	const current = Math.min(Math.max(1, page), pageCount);
	const start = (current - 1) * SUGGESTIONS_PAGE_SIZE;
	const pageItems = items.slice(start, start + SUGGESTIONS_PAGE_SIZE);
	return {
		items: pageItems,
		page: current,
		pageCount,
		from: total === 0 ? 0 : start + 1,
		to: start + pageItems.length,
		total,
	};
}
