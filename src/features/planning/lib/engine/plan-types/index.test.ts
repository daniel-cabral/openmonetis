import { describe, expect, it } from "vitest";
import type { EnginePlan, PlanLifecycle } from "../types";
import type { ExpandContext } from "./context";
import { expandPlanEvents } from "./index";

const ctx: ExpandContext = {
	start: "2027-01",
	end: "2029-01",
	indexForecastPct: { IPCA: 0, INCC: 0 },
	stress: {},
};

function plan(over: Partial<EnginePlan>): EnginePlan {
	return {
		id: "p",
		name: "p",
		priority: 1,
		nonNegotiable: false,
		lifecycle: "active",
		basis: "nominal",
		index: "IPCA",
		targetMonth: "2028-01",
		window: null,
		potAccountIds: [],
		fields: { type: "goal", target: { min: 0, base: 0, max: 0 } },
		events: [],
		bidHistory: [],
		mappedMonthlyOutflow: 0,
		...over,
	};
}

describe("expandPlanEvents", () => {
	it.each(["draft", "paused", "done", "abandoned"] as PlanLifecycle[])(
		"emits no events for a %s plan",
		(lifecycle) => {
			expect(expandPlanEvents(plan({ lifecycle }), ctx)).toEqual([]);
		},
	);

	it("clips manual events to the horizon", () => {
		const events = expandPlanEvents(
			plan({
				events: [
					{
						id: "r",
						label: "rent",
						direction: "outflow",
						amount: { min: 100, base: 100, max: 100 },
						basis: "nominal",
						startMonth: "2026-10",
						endMonth: null,
					},
					{
						id: "o",
						label: "old",
						direction: "outflow",
						amount: { min: 100, base: 100, max: 100 },
						basis: "nominal",
						startMonth: "2026-05",
						endMonth: "2026-05",
					},
				],
			}),
			{ ...ctx, end: "2027-03" },
		);
		expect(events.map((e) => [e.label, e.month])).toEqual([
			["rent", "2027-01"],
			["rent", "2027-02"],
			["rent", "2027-03"],
		]);
	});

	it("scales outflows only under the plan cost stress", () => {
		const events = expandPlanEvents(
			plan({
				events: [
					{
						id: "rent",
						label: "rent",
						direction: "outflow",
						amount: { min: 100_000, base: 100_000, max: 100_000 },
						basis: "nominal",
						startMonth: "2027-02",
						endMonth: "2027-02",
					},
					{
						id: "salary",
						label: "salary",
						direction: "inflow",
						amount: { min: 50_000, base: 50_000, max: 50_000 },
						basis: "nominal",
						startMonth: "2027-02",
						endMonth: "2027-02",
					},
				],
			}),
			{ ...ctx, end: "2027-03", stress: { planCostPct: 10 } },
		);
		expect(events).toEqual([
			{
				planId: "p",
				month: "2027-02",
				direction: "outflow",
				amount: { min: 110_000, base: 110_000, max: 110_000 },
				label: "rent",
			},
			{
				planId: "p",
				month: "2027-02",
				direction: "inflow",
				amount: { min: 50_000, base: 50_000, max: 50_000 },
				label: "salary",
			},
		]);
	});
});
