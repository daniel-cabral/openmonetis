import { z } from "zod";
import type {
	FinanceRequest,
	FinanceResult,
} from "@/features/planning/lib/finance";
import { formatCentsForLlm } from "./llm-format";
import { reaisToCents } from "./llm-input";

const reais = z.number().describe("em reais");
const annualRate = z
	.number()
	.min(0)
	.max(100)
	.default(0)
	.describe("taxa em % ao ano");

export const llmFinanceCalcSchema = z.discriminatedUnion("op", [
	z.object({
		op: z.literal("installment"),
		principal: reais,
		months: z.number().int().min(1).max(600),
		annualRatePct: annualRate,
	}),
	z.object({
		op: z.literal("term"),
		principal: reais,
		installment: reais,
		annualRatePct: annualRate,
	}),
	z.object({
		op: z.literal("present_value"),
		installment: reais,
		months: z.number().int().min(1).max(600),
		annualRatePct: annualRate,
	}),
	z.object({
		op: z.literal("capital_for_income"),
		monthlyIncome: reais,
		annualRealRatePct: z
			.number()
			.min(-10)
			.max(100)
			.describe("taxa real em % ao ano"),
		mode: z.enum(["perpetuity", "drawdown"]),
		months: z.number().int().min(1).max(600).optional(),
	}),
]);

export type LlmFinanceCalc = z.infer<typeof llmFinanceCalcSchema>;

export function toFinanceRequest(input: LlmFinanceCalc): FinanceRequest {
	switch (input.op) {
		case "installment":
			return {
				...input,
				principal: reaisToCents(input.principal),
				annualRatePct: input.annualRatePct ?? 0,
			};
		case "term":
			return {
				...input,
				principal: reaisToCents(input.principal),
				installment: reaisToCents(input.installment),
				annualRatePct: input.annualRatePct ?? 0,
			};
		case "present_value":
			return {
				...input,
				installment: reaisToCents(input.installment),
				annualRatePct: input.annualRatePct ?? 0,
			};
		case "capital_for_income":
			return { ...input, monthlyIncome: reaisToCents(input.monthlyIncome) };
	}
}

export type LlmFinanceResult = {
	op: FinanceRequest["op"];
	result: string;
	assumptions: Record<string, string | number>;
	outsideProjection: true;
};

function assumptionsOf(
	request: FinanceRequest,
): LlmFinanceResult["assumptions"] {
	switch (request.op) {
		case "installment":
			return {
				principal: formatCentsForLlm(request.principal),
				months: request.months,
				annualRatePct: request.annualRatePct,
			};
		case "term":
			return {
				principal: formatCentsForLlm(request.principal),
				installment: formatCentsForLlm(request.installment),
				annualRatePct: request.annualRatePct,
			};
		case "present_value":
			return {
				installment: formatCentsForLlm(request.installment),
				months: request.months,
				annualRatePct: request.annualRatePct,
			};
		case "capital_for_income":
			return {
				monthlyIncome: formatCentsForLlm(request.monthlyIncome),
				annualRealRatePct: request.annualRealRatePct,
				mode: request.mode,
				...(request.months === undefined ? {} : { months: request.months }),
			};
	}
}

export function toLlmFinanceResult(result: FinanceResult): LlmFinanceResult {
	return {
		op: result.request.op,
		result:
			result.unit === "cents"
				? formatCentsForLlm(result.value)
				: `${result.value} meses`,
		assumptions: assumptionsOf(result.request),
		outsideProjection: true,
	};
}
