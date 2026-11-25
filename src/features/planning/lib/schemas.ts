import { z } from "zod";
import { periodSchema, uuidSchema } from "@/shared/lib/schemas/common";

export { periodSchema };

const amountCentsSchema = z
	.number({ message: "Informe um valor válido." })
	.int("Informe um valor em centavos.")
	.min(0, "O valor não pode ser negativo.");

export const amountRangeSchema = z
	.object({
		min: amountCentsSchema,
		base: amountCentsSchema,
		max: amountCentsSchema,
	})
	.superRefine((range, ctx) => {
		if (range.min > range.base || range.base > range.max) {
			ctx.addIssue({
				code: "custom",
				message: "Use mínimo, base e máximo em ordem crescente.",
			});
		}
	});

const windowSchema = z
	.object({ earliest: periodSchema, latest: periodSchema })
	.nullable();

const goalFieldsSchema = z.object({
	type: z.literal("goal"),
	target: amountRangeSchema,
});

const consorcioFieldsSchema = z.object({
	type: z.literal("consorcio"),
	letterValue: amountCentsSchema.positive("Informe o valor da carta."),
	outstandingBalance: amountCentsSchema,
	bidBase: z.enum(["letter", "outstanding", "both"]),
	marginPp: z
		.number()
		.min(0, "A margem não pode ser negativa.")
		.max(50, "A margem vai até 50 pontos percentuais."),
	embeddedBid: z.object({
		enabled: z.boolean(),
		pct: z
			.number()
			.min(0, "O lance embutido não pode ser negativo.")
			.max(30, "O lance embutido vai até 30%."),
	}),
	monthlyInstallment: amountCentsSchema.nullable().optional(),
	lastInstallmentMonth: periodSchema.nullable().optional(),
	postBidMode: z.enum(["reduce-installment", "reduce-term"]).optional(),
});

export const planFieldsSchema = z.object({
	name: z.string().trim().min(1, "Informe o nome do plano."),
	nonNegotiable: z.boolean(),
	lifecycle: z.enum(["draft", "active", "paused", "done", "abandoned"]),
	basis: z.enum(["today", "nominal"]),
	index: z.enum(["IPCA", "INCC"]),
	targetMonth: periodSchema,
	window: windowSchema,
	potAccountIds: z.array(uuidSchema("Pote")),
	fields: z.discriminatedUnion("type", [
		goalFieldsSchema,
		consorcioFieldsSchema,
	]),
});

export const planInputSchema = planFieldsSchema.superRefine((plan, ctx) => {
	if (
		plan.fields.type === "consorcio" &&
		(plan.fields.monthlyInstallment ?? 0) > 0
	) {
		const last = plan.fields.lastInstallmentMonth;
		if (!last) {
			ctx.addIssue({
				code: "custom",
				path: ["fields", "lastInstallmentMonth"],
				message: "Informe o mês da última parcela.",
			});
		} else if (last <= plan.targetMonth) {
			ctx.addIssue({
				code: "custom",
				path: ["fields", "lastInstallmentMonth"],
				message: "A última parcela deve ser depois do mês alvo.",
			});
		}
	}
	const { window } = plan;
	if (!window) {
		return;
	}
	if (window.latest < window.earliest) {
		ctx.addIssue({
			code: "custom",
			path: ["window", "latest"],
			message: "A janela termina antes de começar.",
		});
		return;
	}
	if (plan.targetMonth < window.earliest || plan.targetMonth > window.latest) {
		ctx.addIssue({
			code: "custom",
			path: ["targetMonth"],
			message: "O mês alvo deve estar dentro da janela.",
		});
	}
});

export type PlanInput = z.infer<typeof planInputSchema>;

export const planEventFieldsSchema = z.object({
	label: z.string().trim().min(1, "Informe a descrição do evento."),
	direction: z.enum(["outflow", "inflow"]),
	basis: z.enum(["today", "nominal"]),
	amount: amountRangeSchema,
	startMonth: periodSchema,
	endMonth: periodSchema.nullable(),
});

export const planEventInputSchema = planEventFieldsSchema
	.extend({ id: uuidSchema("Evento").optional(), planId: uuidSchema("Plano") })
	.superRefine((event, ctx) => {
		if (event.endMonth !== null && event.endMonth < event.startMonth) {
			ctx.addIssue({
				code: "custom",
				path: ["endMonth"],
				message: "O fim do evento não pode ser antes do início.",
			});
		}
	});

export type PlanEventInputData = z.infer<typeof planEventInputSchema>;

export const positionLineSchema = z
	.object({
		description: z.string().trim().min(1, "Informe a descrição da posição."),
		amount: amountCentsSchema,
		liquidity: z.enum(["daily", "maturity", "locked"]),
		maturityMonth: periodSchema.nullable(),
		annualRealReturnPct: z.number().nullable(),
	})
	.superRefine((line, ctx) => {
		if (line.liquidity === "maturity" && line.maturityMonth === null) {
			ctx.addIssue({
				code: "custom",
				path: ["maturityMonth"],
				message: "Informe o mês de vencimento.",
			});
		}
		if (line.liquidity !== "maturity" && line.maturityMonth !== null) {
			ctx.addIssue({
				code: "custom",
				path: ["maturityMonth"],
				message: "Vencimento só vale para liquidez no vencimento.",
			});
		}
	});

export const replacePositionsSchema = z.object({
	accountId: uuidSchema("Conta"),
	asOf: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de referência."),
	positions: z
		.array(positionLineSchema)
		.max(50, "Informe no máximo 50 posições."),
});

export type ReplacePositionsInput = z.infer<typeof replacePositionsSchema>;

export const planningSettingsFieldsSchema = z.object({
	plannedContribution: amountCentsSchema,
	reserveMonths: z.number().int().min(0).max(24),
	baselineMonths: z.number().int().min(3).max(24),
	indexForecastPct: z.object({
		IPCA: z.number().min(-10).max(50),
		INCC: z.number().min(-10).max(50),
	}),
	horizonEnd: periodSchema.nullable(),
	stressContributionCap: amountCentsSchema.nullable(),
	stressIncomeLossMonths: z.number().int().min(0).max(24),
	stressPlanCostPct: z.number().min(0).max(100),
	plannerModelId: z.string().nullable(),
});

export type PlanningSettingsInput = z.infer<
	typeof planningSettingsFieldsSchema
>;

export const bidInputSchema = z.object({
	planId: uuidSchema("Plano"),
	month: periodSchema,
	winningBidPct: z
		.number()
		.min(0, "O lance vencedor não pode ser negativo.")
		.max(100, "O lance vencedor vai até 100%."),
});

export type BidInput = z.infer<typeof bidInputSchema>;

export const categoryMappingInputSchema = z.object({
	planId: uuidSchema("Plano"),
	categoryIds: z.array(uuidSchema("Categoria")),
});

export type CategoryMappingInput = z.infer<typeof categoryMappingInputSchema>;

export const assumptionInputSchema = z.object({
	kind: z.enum([
		"contribution",
		"return",
		"bid",
		"index",
		"plan-change",
		"other",
	]),
	summary: z
		.string()
		.trim()
		.min(1, "Descreva a premissa.")
		.max(300, "A premissa deve ter no máximo 300 caracteres."),
	reviewByMonth: periodSchema.nullable(),
});

export type AssumptionInput = z.infer<typeof assumptionInputSchema>;

export const reorderPlansSchema = z.object({
	orderedIds: z
		.array(uuidSchema("Plano"))
		.min(1, "Informe a ordem dos planos."),
});

export type ReorderPlansInput = z.infer<typeof reorderPlansSchema>;
