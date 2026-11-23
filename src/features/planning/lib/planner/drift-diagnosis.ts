import { driftMessages } from "@/features/planning/lib/drift-view";
import type { DriftSignal, Period } from "@/features/planning/lib/engine";
import { formatShortPeriodLabel } from "@/shared/utils/period";

/** PT-BR prefill for the planner chat: one opening line, one bullet per drift signal, one closing question. */
export function buildDriftDiagnosis(
	signals: DriftSignal[],
	planNames: Record<string, string>,
	month: Period,
): string {
	if (signals.length === 0) return "";

	const bullets = driftMessages(signals, planNames).map((message) => `- ${message}`);
	return [
		`Diagnóstico de ${formatShortPeriodLabel(month)}:`,
		...bullets,
		"Qual alavanca você quer explorar?",
	].join("\n");
}
