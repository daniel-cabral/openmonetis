import { formatCents } from "@/features/planning/lib/cents";
import type { DriftSignal } from "@/features/planning/lib/engine";
import { formatShortPeriodLabel } from "@/shared/utils/period";

/** One PT-BR line per drift signal, naming the plan, amount or months involved. */
export function driftMessages(
	signals: DriftSignal[],
	planNames: Record<string, string>,
): string[] {
	return signals.map((signal) => {
		switch (signal.kind) {
			case "plan-at-risk":
				return `${planNames[signal.planId] ?? signal.planId} está em risco`;
			case "plan-off-track":
				return `${planNames[signal.planId] ?? signal.planId} está fora do eixo`;
			case "reserve-below-floor":
				return `Reserva abaixo do piso em ${formatCents(signal.shortfall)}`;
			case "contribution-below-plan":
				return `Aporte abaixo do planejado em ${signal.months.map((month) => formatShortPeriodLabel(month)).join(" e ")}`;
		}
	});
}
