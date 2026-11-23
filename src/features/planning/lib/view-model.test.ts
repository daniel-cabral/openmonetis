import { describe, expect, it } from "vitest";
import { type EnginePlan, runProjection } from "@/features/planning/lib/engine";
import { engineInput, goalPlan, position } from "@/features/planning/lib/engine/test-fixtures";
import type { InvestmentAccountView, PlanningSnapshot, PlanView, PositionView } from "@/features/planning/lib/snapshot-types";
import type { PlanningSettingsInput } from "@/features/planning/lib/schemas";
import { buildKpis } from "./view-model";

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

const today = new Date(2027, 0, 31);

const snapshot = (over: Partial<PlanningSnapshot> = {}): PlanningSnapshot => ({
	currentMonth: "2027-01",
	input: engineInput({}),
	settings,
	plans: [],
	accounts: [],
	contributionsByMonth: [],
	currentMonthContributions: [],
	assumptions: [],
	...over,
});

const positionView = (over: Partial<PositionView>): PositionView => ({
	id: "position",
	description: "CDB",
	amount: 0,
	liquidity: "daily",
	maturityMonth: null,
	annualRealReturnPct: null,
	asOf: "2027-01-21",
	...over,
});

const account = (over: Partial<InvestmentAccountView>): InvestmentAccountView => ({
	id: "A",
	name: "Conta",
	logo: "",
	isEarmarkedPot: false,
	lastAsOf: null,
	positions: [],
	...over,
});

describe("buildKpis", () => {
	it("reads zero and no staleness for a brand-new user", () => {
		const input = engineInput({});

		expect(buildKpis(snapshot({ input }), runProjection(input), today)).toEqual({
			totalPatrimony: 0,
			stalestDays: null,
			isStale: false,
			liquidToday: 0,
			reserveFloor: 0,
			firstUnfunded: null,
		});
	});

	it("totals the positions and flags the oldest account as stale past 45 days", () => {
		const input = engineInput({
			positions: [
				position({ id: "a", accountId: "A", amount: 100_000 }),
				position({ id: "b", accountId: "B", amount: 20_000 }),
			],
		});
		const kpis = buildKpis(
			snapshot({
				input,
				accounts: [
					account({
						id: "A",
						lastAsOf: "2027-01-21",
						positions: [positionView({ id: "a", amount: 100_000 })],
					}),
					account({
						id: "B",
						lastAsOf: "2026-12-12",
						positions: [positionView({ id: "b", amount: 20_000 })],
					}),
				],
			}),
			runProjection(input),
			today,
		);

		expect(kpis.totalPatrimony).toBe(120_000);
		expect(kpis.liquidToday).toBe(120_000);
		expect(kpis.stalestDays).toBe(50);
		expect(kpis.isStale).toBe(true);
	});

	it("names the plan of the first unfunded month", () => {
		const plan: EnginePlan = goalPlan("p", "2027-02", { min: 100_000, base: 100_000, max: 100_000 }, { name: "Viagem" });
		const input = engineInput({ plans: [plan] });
		const planView: PlanView = { ...plan, type: "goal", categoryIds: [] };

		expect(buildKpis(snapshot({ input, plans: [planView] }), runProjection(input), today).firstUnfunded).toEqual({
			month: "2027-02",
			planName: "Viagem",
		});
	});
});
