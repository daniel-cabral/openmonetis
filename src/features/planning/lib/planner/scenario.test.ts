import { describe, expect, it } from "vitest";
import {
	applyStress,
	type ConsorcioFields,
	type EngineInput,
	runProjection,
} from "@/features/planning/lib/engine";
import {
	engineInput,
	goalPlan,
	position,
} from "@/features/planning/lib/engine/test-fixtures";
import { applyScenario } from "./scenario";

const PLAN_ID = "consorcio-plan";
const GOAL_ID = "goal-plan";

const consorcioFields: ConsorcioFields = {
	type: "consorcio",
	letterValue: 10_000_000,
	outstandingBalance: 0,
	bidBase: "letter",
	marginPp: 3,
	embeddedBid: { enabled: false, pct: 0 },
};

const withPlans = (): EngineInput =>
	engineInput({
		startMonth: "2027-01",
		horizonEnd: "2027-06",
		plans: [
			goalPlan(
				PLAN_ID,
				"2027-03",
				{ min: 0, base: 0, max: 0 },
				{
					fields: consorcioFields,
					bidHistory: [{ month: "2026-12", winningBidPct: 40 }],
				},
			),
			goalPlan(GOAL_ID, "2027-04", { min: 0, base: 0, max: 0 }),
		],
	});

describe("applyScenario", () => {
	it("replaces the bid history with the hypothetical bid at the target month, keeping the margin", () => {
		const input = withPlans();

		const result = applyScenario(input, {
			winningBidPct: [{ planId: PLAN_ID, pct: 66 }],
		});

		expect(result.plans[0].bidHistory).toEqual([
			{ month: "2027-03", winningBidPct: 66 },
		]);
		expect(input.plans[0].bidHistory).toEqual([
			{ month: "2026-12", winningBidPct: 40 },
		]);
		const stressed = applyStress(result, { bidAtRangeMax: true });
		expect(
			runProjection(stressed).scenarios.pessimistic.requiredByPlan[PLAN_ID],
		).toBe(6_900_000);
	});

	it("removes, edits and adds positions", () => {
		const input = engineInput({
			positions: [
				position({ id: "p1", amount: 100_000 }),
				position({ id: "p2", amount: 50_000 }),
			],
		});

		const result = applyScenario(input, {
			positions: {
				remove: ["p2"],
				edit: [{ id: "p1", amount: 30_000 }],
				add: [
					{
						accountId: null,
						amount: 10_000,
						liquidity: "daily",
						maturityMonth: null,
						annualRealReturnPct: null,
					},
				],
			},
		});

		expect(result.positions).toEqual([
			position({ id: "p1", amount: 30_000 }),
			{
				id: "scenario-position-0",
				accountId: "scenario",
				amount: 10_000,
				liquidity: "daily",
				maturityMonth: null,
				annualRealReturnPct: null,
			},
		]);
		expect(input.positions).toHaveLength(2);
	});

	it("appends cash events without mutating the input", () => {
		const input = engineInput({});
		const event = {
			month: "2027-02",
			direction: "outflow" as const,
			amount: 200_000,
			label: "reforma",
		};

		const result = applyScenario(input, { cashEvents: [event] });

		expect(result.adhocEvents).toEqual([event]);
		expect(input.adhocEvents).toBeUndefined();
	});

	it.each([
		[
			"an unknown plan id",
			{ winningBidPct: [{ planId: "missing", pct: 50 }] },
			"Plano não encontrado.",
		],
		[
			"a goal plan with a bid",
			{ winningBidPct: [{ planId: GOAL_ID, pct: 50 }] },
			"O lance hipotético só vale para consórcio.",
		],
		[
			"an unknown position id",
			{ positions: { edit: [{ id: "missing", amount: 1 }] } },
			"Posição não encontrada.",
		],
	])("rejects %s", (_label, scenario, message) => {
		expect(() => applyScenario(withPlans(), scenario)).toThrow(message);
	});
});
