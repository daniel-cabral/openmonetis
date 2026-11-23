import { describe, expect, it } from "vitest";
import type { DriftSignal } from "@/features/planning/lib/engine";
import { buildDriftDiagnosis } from "./drift-diagnosis";

const planNames = { "plan-1": "Viagem" };

describe("buildDriftDiagnosis", () => {
	it("is empty when there is no drift signal", () => {
		expect(buildDriftDiagnosis([], planNames, "2027-01")).toBe("");
	});

	it("opens with the month, names the drifting plan and closes with a question", () => {
		const signals: DriftSignal[] = [
			{ kind: "plan-at-risk", planId: "plan-1" },
			{ kind: "reserve-below-floor", shortfall: 150_000 },
		];

		const diagnosis = buildDriftDiagnosis(signals, planNames, "2027-01");

		expect(diagnosis.startsWith("Diagnóstico de Jan/2027")).toBe(true);
		expect(diagnosis).toContain("Viagem");
		expect(diagnosis.trimEnd().endsWith("?")).toBe(true);
	});
});
