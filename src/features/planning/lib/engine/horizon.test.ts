import { describe, expect, it } from "vitest";
import { resolveHorizon } from "./horizon";
import type { EnginePlan, PlanEventInput } from "./types";

function plan(over: Partial<EnginePlan> & { events?: PlanEventInput[] }): EnginePlan {
	return {
		id: "p",
		name: "p",
		priority: 1,
		nonNegotiable: false,
		lifecycle: "active",
		basis: "nominal",
		index: "IPCA",
		targetMonth: "2028-06",
		window: null,
		potAccountIds: [],
		fields: { type: "goal", target: { min: 0, base: 0, max: 0 } },
		events: [],
		bidHistory: [],
		mappedMonthlyOutflow: 0,
		...over,
	};
}

describe("resolveHorizon", () => {
	it.each([
		{
			label: "ends 12 months after the latest window month",
			plans: [plan({ window: { earliest: "2028-01", latest: "2029-03" } })],
			horizonEnd: null,
			end: "2030-03",
		},
		{
			label: "ends 12 months after the latest event end month",
			plans: [
				plan({
					events: [
						{
							id: "e",
							label: "e",
							direction: "outflow",
							amount: { min: 1, base: 1, max: 1 },
							basis: "nominal",
							startMonth: "2028-01",
							endMonth: "2029-09",
						},
					],
				}),
			],
			horizonEnd: null,
			end: "2030-09",
		},
		{
			label: "an explicit horizonEnd wins over the plans",
			plans: [plan({ window: { earliest: "2028-01", latest: "2029-03" } })],
			horizonEnd: "2031-01",
			end: "2031-01",
		},
		{
			label: "ignores draft plans",
			plans: [plan({ lifecycle: "draft", targetMonth: "2035-01" })],
			horizonEnd: null,
			end: "2028-01",
		},
		{
			label: "falls back to 12 months after start with no plans",
			plans: [],
			horizonEnd: null,
			end: "2028-01",
		},
	])("$label", ({ plans, horizonEnd, end }) => {
		expect(resolveHorizon({ startMonth: "2027-01", horizonEnd, plans })).toEqual({
			start: "2027-01",
			end,
		});
	});
});
