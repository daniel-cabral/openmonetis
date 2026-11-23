import { describe, expect, it } from "vitest";
import { runProjection } from "@/features/planning/lib/engine";
import {
	engineInput,
	goalPlan,
	position,
} from "@/features/planning/lib/engine/test-fixtures";
import type { PlanningSettingsInput } from "@/features/planning/lib/schemas";
import type {
	AssumptionView,
	InvestmentAccountView,
	PlanningSnapshot,
	PlanView,
} from "@/features/planning/lib/snapshot-types";
import { buildPlannerContext } from "./context";

const settings: PlanningSettingsInput = {
	plannedContribution: 0,
	reserveMonths: 0,
	baselineMonths: 3,
	indexForecastPct: { IPCA: 0, INCC: 0 },
	horizonEnd: null,
	stressContributionCap: null,
	stressIncomeLossMonths: 0,
	stressPlanCostPct: 0,
	plannerModelId: null,
};

const plan: PlanView = {
	...goalPlan(
		"G",
		"2028-06",
		{ min: 100_000, base: 100_000, max: 100_000 },
		{
			potAccountIds: ["P"],
			events: [
				{
					id: "e1",
					label: "Entrada",
					direction: "outflow",
					amount: { min: 1_000, base: 2_000, max: 3_000 },
					basis: "today",
					startMonth: "2027-03",
					endMonth: null,
				},
			],
		},
	),
	type: "goal",
	categoryIds: [],
};

const pot: InvestmentAccountView = {
	id: "P",
	name: "Caixinha",
	logo: "",
	isEarmarkedPot: true,
	lastAsOf: null,
	positions: [
		{
			id: "m",
			description: "CDB",
			amount: 150_000,
			liquidity: "maturity",
			maturityMonth: "2028-05",
			annualRealReturnPct: null,
			asOf: "2027-01-21",
		},
	],
};

const assumption = (day: number): AssumptionView => ({
	id: `a${day}`,
	kind: "contribution-baseline",
	summary: `Premissa ${day}`,
	source: "user",
	proposalId: null,
	reviewByMonth: null,
	createdAt: `2027-01-${String(day).padStart(2, "0")}T00:00:00.000Z`,
});

const input = engineInput({
	startMonth: "2027-01",
	horizonEnd: "2028-06",
	positions: [
		position({
			id: "m",
			accountId: "P",
			amount: 150_000,
			liquidity: "maturity",
			maturityMonth: "2028-05",
		}),
	],
	potAccountIds: ["P"],
	plans: [plan],
});

const snapshot: PlanningSnapshot = {
	currentMonth: "2027-01",
	input,
	settings,
	plans: [plan],
	accounts: [pot],
	contributionsByMonth: [],
	currentMonthContributions: [],
	assumptions: Array.from({ length: 25 }, (_, index) => assumption(index + 1)),
};

describe("buildPlannerContext", () => {
	it("formats maturities and pots in reais, keeps the 20 newest assumptions and reads plan health from the projection", () => {
		const projection = runProjection(input);

		const context = buildPlannerContext(snapshot, projection);

		expect(context.patrimony.maturities).toEqual([
			{ month: "2028-05", amount: "R$\u00a01.500,00" },
		]);
		expect(context.patrimony.pots).toEqual([
			{ accountId: "P", accountName: "Caixinha", amount: "R$\u00a01.500,00" },
		]);
		expect(context.assumptions).toHaveLength(20);
		expect(context.assumptions[0]?.date).toBe("2027-01-25");
		expect(context.plans[0]?.health).toBe("off-track");
		expect(context.plans[0]).toMatchObject({
			lifecycle: "active",
			basis: "nominal",
			index: "IPCA",
			potAccountIds: ["P"],
			fields: {
				type: "goal",
				target: {
					min: "R$\u00a01.000,00",
					base: "R$\u00a01.000,00",
					max: "R$\u00a01.000,00",
				},
			},
			events: [
				{
					label: "Entrada",
					amount: {
						min: "R$\u00a010,00",
						base: "R$\u00a020,00",
						max: "R$\u00a030,00",
					},
					endMonth: null,
				},
			],
		});
	});

	it("context exposes the index forecast and flags accounts not updated for 45+ days", () => {
		const now = new Date("2027-03-01T00:00:00.000Z");
		const account = (id: string, lastAsOf: string | null) => ({
			...pot,
			id,
			name: id,
			lastAsOf,
		});
		const forecast = { IPCA: 4.5, INCC: 6 };

		const context = buildPlannerContext(
			{
				...snapshot,
				input: { ...input, indexForecastPct: forecast },
				accounts: [
					account("recent", "2027-02-19"),
					account("old", "2027-01-14"),
					account("never", null),
				],
			},
			runProjection(input),
			now,
		);

		expect(context.patrimony.accounts.map((a) => a.stale)).toEqual([
			false,
			true,
			true,
		]);
		expect(context.patrimony.accounts[1]).toMatchObject({
			accountId: "old",
			asOf: "2027-01-14",
		});
		expect(context.indexForecastPct).toEqual(forecast);
	});
});
