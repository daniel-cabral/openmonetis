import { z } from "zod";

/**
 * Categorias de insights
 */
export const INSIGHT_CATEGORIES = {
	behaviors: {
		id: "behaviors",
		title: "Comportamentos Observados",
		icon: "RiEyeLine",
		color: "blue",
	},
	triggers: {
		id: "triggers",
		title: "Gatilhos de Consumo",
		icon: "RiFlashlightLine",
		color: "amber",
	},
	recommendations: {
		id: "recommendations",
		title: "Recomendações Práticas",
		icon: "RiLightbulbLine",
		color: "green",
	},
	improvements: {
		id: "improvements",
		title: "Melhorias Sugeridas",
		icon: "RiRocketLine",
		color: "purple",
	},
} as const;

export type InsightCategoryId = keyof typeof INSIGHT_CATEGORIES;

/**
 * Schema para item individual de insight
 */
const InsightItemSchema = z.object({
	text: z.string().min(1),
});

/**
 * Schema para categoria de insights
 */
const InsightCategorySchema = z.object({
	category: z.enum([
		"behaviors",
		"triggers",
		"recommendations",
		"improvements",
	]),
	items: z.array(InsightItemSchema).min(1).max(6),
});

/**
 * Schema the model fills in: only the four distinct categories
 */
export const InsightsModelSchema = z.object({
	categories: z
		.array(InsightCategorySchema)
		.length(4)
		.refine(
			(categories) =>
				new Set(categories.map((entry) => entry.category)).size === 4,
			{ message: "As 4 categorias devem ser distintas" },
		),
});

/**
 * Schema for complete insights response (model output plus server-set fields)
 */
export const InsightsResponseSchema = InsightsModelSchema.extend({
	month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
	generatedAt: z.string(), // ISO datetime
});

/**
 * TypeScript types derived from schemas
 */
export type InsightsResponse = z.infer<typeof InsightsResponseSchema>;
