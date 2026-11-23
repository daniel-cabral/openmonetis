import { describe, expect, it } from "vitest";
import { goalPlan } from "@/features/planning/lib/engine/test-fixtures";
import { type ChangeBaseline, describeChange } from "./describe-change";

const PLAN_ID = "123e4567-e89b-12d3-a456-426614174000";

const baseline: ChangeBaseline = {
	plans: [
		goalPlan(
			PLAN_ID,
			"2028-06",
			{ min: 100_000, base: 100_000, max: 100_000 },
			{
				name: "Viagem",
			},
		),
	],
	reserveMonths: 3,
	indexForecastPct: { IPCA: 4, INCC: 5 },
};

describe("describeChange", () => {
	it("shows old and new values only for the fields an update-plan patch changes", () => {
		const description = describeChange(
			{
				op: "update-plan",
				planId: PLAN_ID,
				patch: {
					lifecycle: "paused",
					name: "Viagem",
					fields: {
						type: "goal",
						target: { min: 100_000, base: 150_000, max: 150_000 },
					},
				},
			},
			baseline,
		);

		expect(description.title).toBe('Alterar plano "Viagem"');
		expect(description.lines).toEqual([
			"Situação: Ativo → Pausado",
			"Meta (base): R$\u00a01.000,00 → R$\u00a01.500,00",
			"Meta (máx): R$\u00a01.000,00 → R$\u00a01.500,00",
		]);
	});

	it("shows the previous reserve and index forecast when settings change", () => {
		const description = describeChange(
			{
				op: "update-settings",
				patch: {
					plannedContribution: 200_000,
					reserveMonths: 6,
					indexForecastPct: { IPCA: 4, INCC: 7 },
				},
			},
			baseline,
		);

		expect(description.lines).toEqual([
			"Aporte planejado: R$\u00a02.000,00",
			"Meses de reserva: 3 → 6",
			"Previsão INCC (% a.a.): 5 → 7",
		]);
	});

	it("lists the content of a new plan and of an added event", () => {
		const created = describeChange(
			{
				op: "create-plan",
				plan: {
					name: "Carro",
					nonNegotiable: false,
					lifecycle: "active",
					basis: "today",
					index: "IPCA",
					targetMonth: "2028-06",
					window: null,
					potAccountIds: [PLAN_ID],
					fields: {
						type: "goal",
						target: { min: 5_000_000, base: 6_000_000, max: 7_000_000 },
					},
				},
				events: [],
			},
			baseline,
		);
		const event = describeChange(
			{
				op: "add-event",
				planId: PLAN_ID,
				event: {
					label: "Entrada",
					direction: "outflow",
					basis: "nominal",
					amount: { min: 1_000, base: 2_000, max: 3_000 },
					startMonth: "2027-03",
					endMonth: null,
				},
			},
			baseline,
		);

		expect(created.title).toBe('Criar plano "Carro"');
		expect(created.lines).toContain("Meta (base): R$\u00a060.000,00");
		expect(created.lines).toContain("Potes vinculados: 1");
		expect(event.title).toBe('Adicionar evento a "Viagem"');
		expect(event.lines).toContain("Valor (base): R$\u00a020,00");
		expect(event.lines).toContain("Fim: Em aberto");
	});
});
