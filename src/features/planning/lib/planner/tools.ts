import { type ToolSet, tool } from "ai";
import { z } from "zod";
import {
	applyStress,
	type EngineInput,
	LeverError,
	type Period,
	runProjection,
	simulateLever,
} from "@/features/planning/lib/engine";
import { periodSchema } from "@/features/planning/lib/schemas";
import type { CategoryTotal } from "@/features/planning/lib/queries/category-totals";
import { addMonthsToPeriod } from "@/shared/utils/period";
import { rankCutCandidates } from "./cut-candidates";
import {
	formatCentsForLlm,
	toLlmDiff,
	toLlmLeverResult,
	toLlmSummary,
} from "./llm-format";
import {
	type LlmProposalChange,
	llmLeverSchema,
	llmProposalSchema,
	llmStressSchema,
	parseLlmProposal,
	toLever,
	toStress,
} from "./llm-input";
import { type Proposal, ProposalError, applyChangesToInput } from "./proposal";
import {
	type ProjectionSummary,
	type ProposalDiff,
	diffSummaries,
	summarizeProjection,
} from "./summary";

export type ProposalToolOutput =
	| {
			proposalId: string;
			proposal: Proposal;
			before: ProjectionSummary;
			after: ProjectionSummary;
			diff: ProposalDiff;
	  }
	| { error: string };

export type PlannerToolDeps = {
	input: EngineInput;
	excludedCategoryIds: Set<string>;
	loadCategoryTotals: (from: Period, to: Period) => Promise<CategoryTotal[]>;
	webSearch: ToolSet;
};

const llmChangesSchema = llmProposalSchema.shape.changes;

function toErrorOutput(error: unknown): { error: string } {
	if (error instanceof ProposalError || error instanceof LeverError) {
		return { error: error.message };
	}
	throw error;
}

export function buildPlannerTools(deps: PlannerToolDeps): ToolSet {
	const { input } = deps;

	const summarize = (engineInput: EngineInput) =>
		summarizeProjection(runProjection(engineInput), engineInput.plans);

	const withChanges = (changes: LlmProposalChange[] = []): EngineInput => {
		if (changes.length === 0) {
			return input;
		}
		const parsed = parseLlmProposal({
			title: "Simulação",
			rationale: "",
			changes,
		});
		if ("error" in parsed) {
			throw new ProposalError(parsed.error);
		}
		return applyChangesToInput(input, parsed.proposal.changes);
	};

	return {
		get_category_totals: tool({
			description:
				"Despesas por categoria e mês entre dois meses (YYYY-MM), em reais.",
			inputSchema: z.object({ from: periodSchema, to: periodSchema }),
			execute: ({ from, to }) => deps.loadCategoryTotals(from, to),
			toModelOutput: ({ output }) => ({
				type: "json",
				value: output.map((total) => ({
					...total,
					amount: formatCentsForLlm(total.amount),
				})),
			}),
		}),
		list_cut_candidates: tool({
			description:
				"Categorias com maior gasto médio mensal recente, para sugerir cortes. Valores em reais.",
			inputSchema: z.object({ months: z.number().int().min(1).max(12) }),
			execute: async ({ months }) => {
				const totals = await deps.loadCategoryTotals(
					addMonthsToPeriod(input.startMonth, -months),
					addMonthsToPeriod(input.startMonth, -1),
				);
				return rankCutCandidates(totals, months, deps.excludedCategoryIds);
			},
			toModelOutput: ({ output }) => ({
				type: "json",
				value: output.map((candidate) => ({
					categoryName: candidate.categoryName,
					monthlyAverage: formatCentsForLlm(candidate.monthlyAverage),
					lastMonth: formatCentsForLlm(candidate.lastMonth),
				})),
			}),
		}),
		run_projection: tool({
			description:
				"Projeção dos planos com mudanças e estresses hipotéticos. Não altera dados. Valores em reais.",
			inputSchema: z.object({
				changes: llmChangesSchema.optional(),
				stress: llmStressSchema.optional(),
			}),
			execute: ({ changes, stress }) => {
				try {
					return summarize(
						applyStress(withChanges(changes), toStress(stress ?? {})),
					);
				} catch (error) {
					return toErrorOutput(error);
				}
			},
			toModelOutput: ({ output }) => ({
				type: "json",
				value: "error" in output ? output : toLlmSummary(output),
			}),
		}),
		simulate_lever: tool({
			description:
				"Simula uma alavanca (corte, pote, aporte ou adiamento) e mostra o efeito. Valores em reais.",
			inputSchema: z.object({ lever: llmLeverSchema }),
			execute: ({ lever }) => {
				try {
					return simulateLever(input, toLever(lever));
				} catch (error) {
					return toErrorOutput(error);
				}
			},
			toModelOutput: ({ output }) => ({
				type: "json",
				value: "error" in output ? output : toLlmLeverResult(output),
			}),
		}),
		propose_change: tool({
			description:
				"Propõe mudanças no planejamento para o usuário aprovar. Não altera dados. Valores em reais.",
			inputSchema: llmProposalSchema,
			execute: (llmProposal, { toolCallId }): ProposalToolOutput => {
				const parsed = parseLlmProposal(llmProposal);
				if ("error" in parsed) {
					return { error: parsed.error };
				}
				try {
					const before = summarize(input);
					const after = summarize(
						applyChangesToInput(input, parsed.proposal.changes),
					);
					return {
						proposalId: toolCallId,
						proposal: parsed.proposal,
						before,
						after,
						diff: diffSummaries(before, after),
					};
				} catch (error) {
					return toErrorOutput(error);
				}
			},
			toModelOutput: ({ output }) => ({
				type: "json",
				value:
					"error" in output
						? output
						: {
								proposalId: output.proposalId,
								title: output.proposal.title,
								diff: toLlmDiff(output.diff),
								after: toLlmSummary(output.after),
							},
			}),
		}),
		...deps.webSearch,
	};
}
