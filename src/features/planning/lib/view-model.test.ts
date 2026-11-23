import { describe, expect, it } from "vitest";
import { type EnginePlan, runProjection } from "@/features/planning/lib/engine";
import { engineInput, goalPlan, position } from "@/features/planning/lib/engine/test-fixtures";
import type { PlanningSettingsInput } from "@/features/planning/lib/schemas";
import type { InvestmentAccountView, PlanningSnapshot, PlanView, PositionView } from "@/features/planning/lib/snapshot-types";
import { buildChartSeries, buildKpis, buildPlanRows } from "./view-model";

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
describe("buildChartSeries", () => {
	it("plots base and pessimistic liquidity and the base required amount for each month", () => {
		const plan = goalPlan("p", "2027-02", { min: 50_000, base: 60_000, max: 70_000 });
		const input = engineInput({
			horizonEnd: "2027-02",
			positions: [position({ id: "a", amount: 100_000 })],
			incomeBaseline: 10_000,
			plans: [plan],
		});

		expect(buildChartSeries(runProjection(input))).toEqual([
			{ month: "2027-01", label: "Jan/2027", base: 110_000, pessimistic: 110_000, required: 0 },
			{ month: "2027-02", label: "Fev/2027", base: 60_000, pessimistic: 50_000, required: 60_000 },
		]);
	});
});

describe("buildPlanRows", () => {
	it("lists the reserve first, then each active plan covered by the funded share of its required amount", () => {
		const plan = goalPlan("p", "2027-02", { min: 50_000, base: 50_000, max: 50_000 }, {
			events: [
				{
					id: "e",
					label: "Entrada",
					direction: "outflow",
					amount: { min: 150_000, base: 150_000, max: 150_000 },
					basis: "nominal",
					startMonth: "2027-01",
					endMonth: "2027-01",
				},
			],
		});
		const input = engineInput({
			horizonEnd: "2027-02",
			positions: [position({ id: "a", amount: 150_000 })],
			plans: [plan],
		});
		const planView: PlanView = { ...plan, type: "goal", categoryIds: [] };
		const projection = runProjection(input);
		const rows = buildPlanRows([planView], projection, buildKpis(snapshot({ input, plans: [planView] }), projection, today));

		expect(rows.map((row) => row.id)).toEqual(["reserve", "p"]);
		expect(rows[1]).toMatchObject({ target: 200_000, coveragePct: 75, health: "off-track", month: "2027-02" });
	});

	it("covers a plan with nothing left in the horizon at 100%, not NaN", () => {
		const plan = goalPlan("late", "2028-06", { min: 50_000, base: 50_000, max: 50_000 });
		const input = engineInput({ horizonEnd: "2027-02", plans: [plan] });
		const planView: PlanView = { ...plan, type: "goal", categoryIds: [] };
		const projection = runProjection(input);
		const rows = buildPlanRows([planView], projection, buildKpis(snapshot({ input, plans: [planView] }), projection, today));

		expect(rows[1]).toMatchObject({ target: 0, coveragePct: 100 });
	});

	it("covers the reserve floor from liquid money and reads a zero floor as fully covered", () => {
		const underFunded = engineInput({
			reserveMonths: 2,
			costOfLiving: 100_000,
			horizonEnd: "2027-02",
			positions: [position({ id: "a", amount: 150_000 })],
		});
		const underProjection = runProjection(underFunded);
		const underKpis = buildKpis(snapshot({ input: underFunded }), underProjection, today);

		expect(buildPlanRows([], underProjection, underKpis)[0]).toMatchObject({
			id: "reserve",
			target: 200_000,
			coveragePct: 75,
			health: "off-track",
		});

		const emptyInput = engineInput({});
		const emptyProjection = runProjection(emptyInput);
		const emptyKpis = buildKpis(snapshot({ input: emptyInput }), emptyProjection, today);

		expect(buildPlanRows([], emptyProjection, emptyKpis)[0]).toMatchObject({ target: 0, coveragePct: 100, health: "on-track" });
	});
});
