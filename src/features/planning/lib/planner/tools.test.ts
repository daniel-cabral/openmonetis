import type { ToolSet } from "ai";
import { describe, expect, it } from "vitest";
import {
	engineInput,
	goalPlan,
	position,
} from "@/features/planning/lib/engine/test-fixtures";
import type { CategoryTotal } from "@/features/planning/lib/queries/category-totals";
import { rankCutCandidates } from "./cut-candidates";
import { buildPlannerTools, type PlannerToolDeps } from "./tools";

const PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";

type Callable = {
	execute: (
		input: unknown,
		options: { toolCallId: string; messages: [] },
	) => unknown;
	toModelOutput: (options: {
		toolCallId: string;
		input: unknown;
		output: unknown;
	}) => unknown;
};

const named = (tools: ToolSet, name: string) =>
	tools[name] as unknown as Callable;

const total = (
	categoryId: string,
	categoryName: string,
	amount: number,
): CategoryTotal => ({
	categoryId,
	categoryName,
	month: "2026-03",
	amount,
});

const deps = (over: Partial<PlannerToolDeps> = {}): PlannerToolDeps => ({
	input: engineInput({
		startMonth: "2026-01",
		horizonEnd: "2026-03",
		positions: [position({ id: "conta-corrente", amount: 100_000 })],
	}),
	plannedContribution: 0,
	excludedCategoryIds: new Set(),
	loadCategoryTotals: async () => [],
	webSearch: {},
	...over,
});

const goalProposal = {
	title: "Reserva para viagem",
	rationale: "",
	changes: [
		{
			op: "create-plan",
			plan: {
				name: "Viagem",
				nonNegotiable: false,
				lifecycle: "active",
				basis: "nominal",
				index: "IPCA",
				targetMonth: "2026-02",
				window: null,
				potAccountIds: [],
				fields: { type: "goal", target: { min: 300, base: 300, max: 300 } },
			},
			events: [],
		},
	],
};

describe("rankCutCandidates", () => {
	it("ranks the top five categories by monthly average and skips excluded ones", () => {
		const totals = [
			total("aluguel", "Aluguel", 500_000),
			total("mercado", "Mercado", 90_000),
			total("lazer", "Lazer", 60_000),
			total("farmacia", "Farmácia", 45_000),
			total("transporte", "Transporte", 30_000),
			total("vestuario", "Vestuário", 12_000),
			total("streaming", "Streaming", 9_000),
		];

		const ranked = rankCutCandidates(totals, 3, new Set(["aluguel"]));

		expect(ranked.map((candidate) => candidate.categoryName)).toEqual([
			"Mercado",
			"Lazer",
			"Farmácia",
			"Transporte",
			"Vestuário",
		]);
		expect(ranked[0]).toEqual({
			categoryId: "mercado",
			categoryName: "Mercado",
			monthlyAverage: 30_000,
			lastMonth: 90_000,
		});
	});
});

describe("buildPlannerTools", () => {
	it("returns the new plan's health change and a model view with reais only", async () => {
		const tools = buildPlannerTools(deps());

		const output = await named(tools, "propose_change").execute(goalProposal, {
			toolCallId: "call-1",
			messages: [],
		});

		expect(output).toMatchObject({
			proposalId: "call-1",
			diff: {
				healthChanges: [{ name: "Viagem", from: null, to: "on-track" }],
				minSlackBaseDelta: -30_000,
			},
		});
		const view = (await named(tools, "propose_change").toModelOutput({
			toolCallId: "call-1",
			input: goalProposal,
			output,
		})) as { value: { diff: { minSlackBaseDelta: string } } };
		expect(view.value.diff.minSlackBaseDelta).toBe("-R$\u00a0300,00");
	});

	it("returns an error to the model when a change targets a plan that does not exist", async () => {
		const tools = buildPlannerTools(deps());

		const output = await named(tools, "propose_change").execute(
			{
				title: "Ajuste",
				rationale: "",
				changes: [
					{ op: "update-plan", planId: PLAN_ID, patch: { name: "Outro" } },
				],
			},
			{ toolCallId: "call-2", messages: [] },
		);

		expect(output).toEqual({ error: "Plano não encontrado." });
	});

	it("returns an error to the model when a shift leaves the plan window", async () => {
		const input = engineInput({
			startMonth: "2026-01",
			horizonEnd: "2026-03",
			plans: [
				goalPlan(
					PLAN_ID,
					"2026-02",
					{ min: 300, base: 300, max: 300 },
					{
						window: { earliest: "2026-01", latest: "2026-02" },
					},
				),
			],
		});
		const tools = buildPlannerTools(deps({ input }));

		const output = await named(tools, "simulate_lever").execute(
			{ lever: { kind: "shift-plan", planId: PLAN_ID, month: "2026-03" } },
			{ toolCallId: "call-3", messages: [] },
		);

		expect(output).toEqual({ error: expect.any(String) });
	});

	it("finance_calc returns a reais view marked outside the projection, and an error for a perpetuity at zero rate", async () => {
		const tools = buildPlannerTools(deps());
		const input = { op: "installment", principal: 1000, months: 4 } as const;

		const output = await named(tools, "finance_calc").execute(input, {
			toolCallId: "call-fc",
			messages: [],
		});

		expect(output).toMatchObject({
			value: 25_000,
			unit: "cents",
			outsideProjection: true,
		});
		const view = await named(tools, "finance_calc").toModelOutput({
			toolCallId: "call-fc",
			input,
			output,
		});
		expect(view).toMatchObject({
			type: "json",
			value: {
				op: "installment",
				result: "R$ 250,00",
				outsideProjection: true,
			},
		});
		expect(
			await named(tools, "finance_calc").execute(
				{
					op: "capital_for_income",
					monthlyIncome: 5000,
					annualRealRatePct: 0,
					mode: "perpetuity",
				},
				{ toolCallId: "call-fc2", messages: [] },
			),
		).toEqual({ error: "Perpetuidade exige taxa real maior que zero." });
	});

	it("exposes only the six planner tools when the model has no web search", () => {
		expect(Object.keys(buildPlannerTools(deps())).sort()).toEqual([
			"finance_calc",
			"get_category_totals",
			"list_cut_candidates",
			"propose_change",
			"run_projection",
			"simulate_lever",
		]);
	});
});
