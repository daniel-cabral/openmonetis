import { describe, expect, it } from "vitest";
import { runProjection } from "@/features/planning/lib/engine";
import { engineInput } from "@/features/planning/lib/engine/test-fixtures";
import type { PlanningSnapshot } from "@/features/planning/lib/snapshot-types";
import { WEB_SEARCH_POLICY } from "@/shared/lib/ai/web-search";
import { buildPlannerContext } from "./context";
import { buildSystemPrompt } from "./system-prompt";

const input = engineInput({ startMonth: "2027-01", horizonEnd: "2027-06" });

const snapshot: PlanningSnapshot = {
	currentMonth: "2027-01",
	input,
	settings: {
		plannedContribution: 0,
		reserveMonths: 0,
		baselineMonths: 3,
		indexForecastPct: { IPCA: 0, INCC: 0 },
		horizonEnd: null,
		stressContributionCap: null,
		stressIncomeLossMonths: 0,
		stressPlanCostPct: 0,
		plannerModelId: null,
	},
	plans: [],
	accounts: [],
	contributionsByMonth: [],
	currentMonthContributions: [],
	assumptions: [],
};

const context = buildPlannerContext(snapshot, runProjection(input));

describe("buildSystemPrompt", () => {
	it("prompt carries glossary, tool-number rules and the answer discipline", () => {
		const prompt = buildSystemPrompt(context, { webSearch: false });

		for (const literal of [
			"locked",
			"nonNegotiable",
			"marginPp",
			"71%",
			"reais de hoje",
			"no máximo 3",
			"resposta em texto",
			"Fatos externos",
		]) {
			expect(prompt).toContain(literal);
		}
		expect(prompt).not.toContain(
			"Nunca calcule nem estime números. Todo valor",
		);
		expect(prompt.endsWith(JSON.stringify(context))).toBe(true);
	});

	it("web search policy appears only when web search is enabled", () => {
		const on = buildSystemPrompt(context, { webSearch: true });
		const off = buildSystemPrompt(context, { webSearch: false });

		expect(on).toContain(WEB_SEARCH_POLICY);
		expect(on).toContain("fonte e data");
		expect(on).toContain("confirm");
		expect(off).not.toContain(WEB_SEARCH_POLICY);
		expect(off).not.toContain("pesquis");
		expect(off).not.toContain("confirm");
	});
});
