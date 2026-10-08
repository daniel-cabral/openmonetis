// Installments share purchase date and split shares share everything but the payer:
// show each installment series or split group once (D7). Recurring rows link per
// occurrence (D4), so each occurrence stays its own suggestion.
export function dedupeSuggestions<
	T extends {
		id: string;
		installmentCount: number | null;
		seriesId: string | null;
		splitGroupId: string | null;
	},
>(rows: T[]): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const row of rows) {
		const installmentSeries = row.installmentCount ? row.seriesId : null;
		const key = installmentSeries ?? row.splitGroupId ?? row.id;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(row);
	}
	return result;
}
