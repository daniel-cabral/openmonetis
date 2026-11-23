import { describe, expect, it } from "vitest";
import type {
	MonthRow,
	PlanHealth,
	Projection,
	Scenario,
	ScenarioResult,
	UnfundedAt,
} from "@/features/planning/lib/engine";
import { formatCentsForLlm, toLlmDiff, toLlmSummary } from "./llm-format";
import {
	diffSummaries,
	type ProjectionSummary,
	summarizeProjection,
} from "./summary";

const monthRow = (month: string, slack: number): MonthRow => ({
	month,
	totalPatrimony: 0,
	liquid: 0,
	required: 0,
	paid: 0,
	reserveFloor: 0,
	slack,
	unfundedPlanIds: [],
	reserveBreached: false,
});

const scenarioResult = (
	scenario: Scenario,
	slacks: [month: string, slack: number][],
	firstUnfunded: UnfundedAt | null,
	shortfallByPlan: Record<string, number> = {},
): ScenarioResult => ({
	scenario,
	months: slacks.map(([month, slack]) => monthRow(month, slack)),
	firstUnfunded,
	requiredByPlan: {},
	shortfallByPlan,
});

const projectionOf = (
	base: ScenarioResult,
	pessimistic: ScenarioResult,
	health: Record<string, PlanHealth>,
): Projection => ({
	start: "2027-01",
	end: "2027-03",
	scenarios: { base, pessimistic, optimistic: base },
	health,
});

describe("summarizeProjection", () => {
	it("keeps only plans with health and reports first unfunded month, min slack and shortfall", () => {
		const projection = projectionOf(
			scenarioResult(
				"base",
				[
					["2027-01", 500],
					["2027-02", 200],
					["2027-03", 300],
				],
				{ month: "2027-03", planId: "plan-1" },
				{ "plan-1": 4_000 },
			),
			scenarioResult(
				"pessimistic",
				[
					["2027-01", -100],
					["2027-02", 50],
					["2027-03", 80],
				],
				{ month: "2027-02", planId: "plan-1" },
			),
			{ "plan-1": "off-track" },
		);

		expect(
			summarizeProjection(projection, [
				{ id: "plan-1", name: "Carro" },
				{ id: "plan-draft", name: "Rascunho" },
			]),
		).toEqual({
			horizonEnd: "2027-03",
			firstUnfunded: {
				base: { month: "2027-03", planName: "Carro" },
				pessimistic: { month: "2027-02", planName: "Carro" },
			},
			minSlack: { base: 200, pessimistic: -100 },
			plans: [
				{
					id: "plan-1",
					name: "Carro",
					health: "off-track",
					shortfallBase: 4_000,
				},
			],
		});
	});
});

describe("diffSummaries", () => {
	it("lists only plans whose health changed, with new plans coming from null", () => {
		const before: ProjectionSummary = {
			horizonEnd: "2027-03",
			firstUnfunded: {
				base: { month: "2027-03", planName: "Carro" },
				pessimistic: null,
			},
			minSlack: { base: 200, pessimistic: -100 },
			plans: [
				{ id: "plan-1", name: "Carro", health: "at-risk", shortfallBase: 0 },
				{ id: "plan-3", name: "Reserva", health: "on-track", shortfallBase: 0 },
			],
		};
		const after: ProjectionSummary = {
			horizonEnd: "2027-03",
			firstUnfunded: { base: null, pessimistic: null },
			minSlack: { base: 350, pessimistic: 0 },
			plans: [
				{ id: "plan-1", name: "Carro", health: "on-track", shortfallBase: 0 },
				{ id: "plan-2", name: "Viagem", health: "on-track", shortfallBase: 0 },
				{ id: "plan-3", name: "Reserva", health: "on-track", shortfallBase: 0 },
			],
		};

		expect(diffSummaries(before, after)).toEqual({
			healthChanges: [
				{ name: "Carro", from: "at-risk", to: "on-track" },
				{ name: "Viagem", from: null, to: "on-track" },
			],
			firstUnfundedBase: { from: "2027-03", to: null },
			minSlackBaseDelta: 150,
		});
	});
});

describe("LLM view of summaries", () => {
	it("formats every money value in reais, not centavos", () => {
		const summary: ProjectionSummary = {
			horizonEnd: "2027-03",
			firstUnfunded: { base: null, pessimistic: null },
			minSlack: { base: 20_000, pessimistic: 0 },
			plans: [],
		};
		const diff = diffSummaries(
			{ ...summary, minSlack: { base: 5_000, pessimistic: 0 } },
			summary,
		);

		expect(formatCentsForLlm(10_000_000)).toBe("R$\u00a0100.000,00");
		expect(toLlmSummary(summary).minSlack.base).toBe("R$\u00a0200,00");
		expect(toLlmDiff(diff).minSlackBaseDelta).toBe("R$\u00a0150,00");
	});
});
