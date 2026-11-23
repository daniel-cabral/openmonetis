import { describe, expect, it } from "vitest";
import { runProjection } from "@/features/planning/lib/engine";
import {
	engineInput,
	goalPlan,
} from "@/features/planning/lib/engine/test-fixtures";
import {
	applyChangesToInput,
	type ProposalChange,
	ProposalError,
} from "./proposal";

const range = { min: 100_000, base: 100_000, max: 100_000 };

const ctx = { plannedContribution: 100_000 };

const input = engineInput({
	reserveMonths: 3,
	plans: [
		goalPlan("plan-1", "2027-06", range, {
			priority: 1,
			window: { earliest: "2027-01", latest: "2027-12" },
		}),
		goalPlan("plan-2", "2027-08", range, { priority: 2 }),
	],
});

describe("applyChangesToInput", () => {
	it("appends a created plan after the existing priorities and leaves the input untouched", () => {
		const before = structuredClone(input);
		const changes: ProposalChange[] = [
			{
				op: "create-plan",
				plan: {
					name: "Viagem",
					nonNegotiable: false,
					lifecycle: "active",
					basis: "nominal",
					index: "IPCA",
					targetMonth: "2027-09",
					window: null,
					potAccountIds: [],
					fields: { type: "goal", target: range },
				},
				events: [],
			},
		];

		const result = applyChangesToInput(input, changes, ctx, () => "plan-new");

		expect(result.plans.map((plan) => [plan.id, plan.priority])).toEqual([
			["plan-1", 1],
			["plan-2", 2],
			["plan-new", 3],
		]);
		expect(input).toEqual(before);
	});

	it("rejects an update that moves the target month out of the plan window", () => {
		const changes: ProposalChange[] = [
			{
				op: "update-plan",
				planId: "plan-1",
				patch: { targetMonth: "2028-01" },
			},
		];

		expect(() => applyChangesToInput(input, changes, ctx)).toThrow(
			ProposalError,
		);
	});

	it("rejects a change to a plan that does not exist", () => {
		const changes: ProposalChange[] = [
			{
				op: "update-plan",
				planId: "missing",
				patch: { name: "Outro nome" },
			},
		];

		expect(() => applyChangesToInput(input, changes, ctx)).toThrow(
			ProposalError,
		);
	});

	it("updates only the reserve months when the settings patch carries just that field", () => {
		const changes: ProposalChange[] = [
			{ op: "update-settings", patch: { reserveMonths: 6 } },
		];

		expect(applyChangesToInput(input, changes, ctx)).toEqual({
			...input,
			reserveMonths: 6,
		});
	});

	it("a raised planned contribution changes the projection", () => {
		const slack = (value: typeof input) =>
			Math.min(
				...runProjection(value).scenarios.base.months.map((row) => row.slack),
			);
		const raised = applyChangesToInput(
			input,
			[{ op: "update-settings", patch: { plannedContribution: 300_000 } }],
			ctx,
		);
		const untouched = applyChangesToInput(
			input,
			[{ op: "update-settings", patch: { reserveMonths: 6 } }],
			ctx,
		);

		expect(raised.extraMonthlySaving).toBe(200_000);
		expect(slack(raised)).toBeGreaterThan(slack(input));
		expect(untouched.extraMonthlySaving).toBe(input.extraMonthlySaving);
	});
});
