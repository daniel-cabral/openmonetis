import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { planningSettings, plans } from "@/db/schema";
import type { db } from "@/shared/lib/db";
import { summarizePlanning } from "./planning-summary";

function fakeDatabase(rows: Map<unknown, unknown[]>) {
	const wheres: { table: unknown; condition: unknown }[] = [];
	const database = {
		select: () => ({
			from: (table: unknown) => ({
				where: (condition: unknown) => {
					wheres.push({ table, condition });
					return Promise.resolve(rows.get(table) ?? []);
				},
			}),
		}),
	} as unknown as typeof db;
	return { database, wheres };
}

describe("summarizePlanning", () => {
	it("summarizes only the signed-in user's plans, or null without plans", async () => {
		const { database, wheres } = fakeDatabase(
			new Map<unknown, unknown[]>([
				[
					plans,
					[
						{
							name: "Casa",
							type: "goal",
							targetMonth: "2030-01",
							lifecycle: "active",
							nonNegotiable: true,
							priority: 2,
						},
						{
							name: "x".repeat(200),
							type: "consorcio",
							targetMonth: "2028-06",
							lifecycle: "draft",
							nonNegotiable: false,
							priority: 1,
						},
					],
				],
				[
					planningSettings,
					[{ plannedContribution: "1500.00", reserveMonths: 4 }],
				],
			]),
		);

		const summary = await summarizePlanning("u1", { database });

		expect(summary?.plannedContribution).toBe(1500);
		expect(summary?.reserveMonths).toBe(4);
		expect(summary?.plans.map((plan) => plan.type)).toEqual([
			"consorcio",
			"goal",
		]);
		expect(summary?.plans[0].name).toHaveLength(80);
		expect(summary?.plans[1]).toEqual({
			name: "Casa",
			type: "goal",
			targetMonth: "2030-01",
			lifecycle: "active",
			nonNegotiable: true,
		});
		expect(wheres).toHaveLength(2);
		for (const { condition } of wheres) {
			const query = new PgDialect().sqlToQuery(condition as never);
			expect(query.sql).toContain("user_id");
			expect(query.params).toEqual(["u1"]);
		}

		const empty = fakeDatabase(new Map());
		expect(
			await summarizePlanning("u1", { database: empty.database }),
		).toBeNull();
	});
});
