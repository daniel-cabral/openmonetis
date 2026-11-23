import { describe, expect, it } from "vitest";
import type { DriftSignal } from "@/features/planning/lib/engine";
import { driftMessages } from "./drift-view";

const planNames = { "plan-1": "Viagem" };

describe("driftMessages", () => {
	it.each<[DriftSignal, string]>([
		[{ kind: "plan-at-risk", planId: "plan-1" }, "Viagem está em risco"],
		[{ kind: "plan-off-track", planId: "plan-1" }, "Viagem está fora do eixo"],
		[
			{ kind: "reserve-below-floor", shortfall: 150_000 },
			"Reserva abaixo do piso em R$",
		],
		[
			{ kind: "contribution-below-plan", months: ["2027-01", "2027-02"] },
			"Aporte abaixo do planejado em Jan/2027 e Fev/2027",
		],
	])("writes one PT-BR line for %j", (signal, expected) => {
		const messages = driftMessages([signal], planNames);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain(expected);
	});
});
