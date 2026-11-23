import { describe, expect, it } from "vitest";
import { InsightsModelSchema, InsightsResponseSchema } from "./insights";

const entry = (category: string) => ({
	category,
	items: [{ text: "x" }],
});

describe("insights schemas", () => {
	it("model schema has only categories and requires four distinct ones", () => {
		expect(Object.keys(InsightsModelSchema.shape)).toEqual(["categories"]);

		const distinct = [
			"behaviors",
			"triggers",
			"recommendations",
			"improvements",
		].map(entry);
		expect(
			InsightsModelSchema.safeParse({ categories: distinct }).success,
		).toBe(true);

		const repeated = ["behaviors", "behaviors", "triggers", "improvements"].map(
			entry,
		);
		expect(
			InsightsModelSchema.safeParse({ categories: repeated }).success,
		).toBe(false);

		expect(
			InsightsResponseSchema.safeParse({ categories: distinct }).success,
		).toBe(false);
		expect(
			InsightsResponseSchema.safeParse({
				categories: distinct,
				month: "2026-11",
				generatedAt: "2026-11-23T00:00:00.000Z",
			}).success,
		).toBe(true);
	});
});
