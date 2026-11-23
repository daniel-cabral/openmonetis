import type {
	AssumptionInput,
	PlanningSettingsInput,
} from "@/features/planning/lib/schemas";
import { currencyFormatter } from "@/shared/utils/currency";

function formatPct(value: number): string {
	return `${value.toFixed(2).replace(".", ",")}%`;
}

export function changedAssumptions(
	previous: PlanningSettingsInput,
	next: PlanningSettingsInput,
): AssumptionInput[] {
	const entries: AssumptionInput[] = [];

	if (next.plannedContribution !== previous.plannedContribution) {
		const from = currencyFormatter.format(previous.plannedContribution / 100);
		const to = currencyFormatter.format(next.plannedContribution / 100);
		entries.push({
			kind: "contribution",
			summary: `Aporte planejado: ${from} → ${to} por mês`,
			reviewByMonth: null,
		});
	}

	for (const index of ["IPCA", "INCC"] as const) {
		if (next.indexForecastPct[index] !== previous.indexForecastPct[index]) {
			entries.push({
				kind: "index",
				summary: `Previsão de ${index}: ${formatPct(previous.indexForecastPct[index])} → ${formatPct(next.indexForecastPct[index])} ao ano`,
				reviewByMonth: null,
			});
		}
	}

	return entries;
}
