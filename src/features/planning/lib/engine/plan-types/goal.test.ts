import { describe, expect, it } from "vitest";
import type { AmountRange, Cents, EnginePlan, GoalFields, Period } from "../types";
import type { ExpandContext } from "./context";
import { expandGoalEvents } from "./goal";

const ctx: ExpandContext = {
	start: "2027-01",
	end: "2029-01",
	indexForecastPct: { IPCA: 12, INCC: 0 },
	stress: {},
};

function goal(over: {
	target: AmountRange;
	targetMonth?: Period;
	mappedMonthlyOutflow?: Cents;
}): EnginePlan & { fields: GoalFields } {
	return {
		id: "g",
		name: "g",
		priority: 1,
		nonNegotiable: false,
		lifecycle: "active",
		basis: "today",
		index: "IPCA",
		targetMonth: over.targetMonth ?? "2028-01",
		window: null,
		potAccountIds: [],
		fields: { type: "goal", target: over.target },
		events: [],
		bidHistory: [],
		mappedMonthlyOutflow: over.mappedMonthlyOutflow ?? 0,
	};
}

describe("expandGoalEvents", () => {
	it("inflates a today's-money target by the plan index up to its month", () => {
		const events = expandGoalEvents(
			goal({ target: { min: 90_000, base: 100_000, max: 120_000 } }),
			ctx,
		);

		expect(events).toEqual([
			{
				planId: "g",
				month: "2028-01",
				direction: "outflow",
				amount: { min: 100_800, base: 112_000, max: 134_400 },
				label: "g",
			},
		]);
	});

	it("pays mapped outflows toward the target and reduces the target by their sum", () => {
		const events = expandGoalEvents(
			goal({
				target: { min: 90_000, base: 100_000, max: 120_000 },
				mappedMonthlyOutflow: 1_000,
			}),
			ctx,
		);

		expect(events.filter((e) => e.label === "mapped")).toHaveLength(12);
		expect(events.at(-1)?.amount).toEqual({ min: 88_800, base: 100_000, max: 122_400 });
	});
});
