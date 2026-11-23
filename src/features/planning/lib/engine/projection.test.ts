import { describe, expect, it } from "vitest";
import { runProjection } from "./projection";
import { engineInput, goalPlan, position } from "./test-fixtures";

const claim = { min: 100_000, base: 150_000, max: 200_000 };

describe("runProjection", () => {
	it.each([
		[250_000, "on-track", null],
		[180_000, "at-risk", { month: "2027-02", planId: "p" }],
		[120_000, "off-track", { month: "2027-02", planId: "p" }],
	] as const)("general %i gives %s when the claim is funded in base and pessimistic", (general, health, firstPessimistic) => {
		const result = runProjection(
			engineInput({
				positions: [position({ id: "cash", accountId: "cash", amount: general })],
				plans: [goalPlan("p", "2027-02", claim)],
			}),
		);

		expect(result.health.p).toBe(health);
		expect(result.scenarios.pessimistic.firstUnfunded).toEqual(firstPessimistic);
	});

	it("gives no health to draft plans", () => {
		const result = runProjection(
			engineInput({
				plans: [goalPlan("p", "2027-02", claim, { lifecycle: "draft" })],
			}),
		);

		expect(result.health).toEqual({});
	});
});
