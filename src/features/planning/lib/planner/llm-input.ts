import { z } from "zod";
import { toCents } from "@/features/planning/lib/cents";
import type {
	AmountRange,
	Cents,
	Lever,
	StressToggles,
} from "@/features/planning/lib/engine";
import {
	assumptionInputSchema,
	periodSchema,
	planEventFieldsSchema,
	planFieldsSchema,
	planningSettingsFieldsSchema,
} from "@/features/planning/lib/schemas";
import {
	type ProposalChange,
	ProposalError,
	type Proposal,
	proposalSchema,
} from "./proposal";

const reais = z.number().describe("em reais");

const llmAmountRangeSchema = z.object({
	min: reais,
	base: reais,
	max: reais,
});

const llmPlanFieldsSchema = planFieldsSchema.omit({ fields: true }).extend({
	fields: z.discriminatedUnion("type", [
		z.object({ type: z.literal("goal"), target: llmAmountRangeSchema }),
		z.object({
			type: z.literal("consorcio"),
			letterValue: reais,
			outstandingBalance: reais,
			bidBase: z.enum(["letter", "outstanding", "both"]),
			marginPp: z.number(),
			embeddedBid: z.object({ enabled: z.boolean(), pct: z.number() }),
		}),
	]),
});

const llmEventSchema = planEventFieldsSchema.extend({
	amount: llmAmountRangeSchema,
});

const llmSettingsPatchSchema = planningSettingsFieldsSchema
	.pick({
		plannedContribution: true,
		reserveMonths: true,
		indexForecastPct: true,
	})
	.extend({ plannedContribution: reais })
	.partial();

const llmProposalChangeSchema = z.discriminatedUnion("op", [
	z.object({
		op: z.literal("create-plan"),
		plan: llmPlanFieldsSchema,
		events: z.array(llmEventSchema).max(10).default([]),
	}),
	z.object({
		op: z.literal("update-plan"),
		planId: z.uuid(),
		patch: llmPlanFieldsSchema.partial(),
	}),
	z.object({
		op: z.literal("add-event"),
		planId: z.uuid(),
		event: llmEventSchema,
	}),
	z.object({
		op: z.literal("update-settings"),
		patch: llmSettingsPatchSchema,
	}),
	z.object({
		op: z.literal("record-assumption"),
		assumption: assumptionInputSchema,
	}),
]);

export const llmProposalSchema = proposalSchema.omit({ changes: true }).extend({
	changes: z.array(llmProposalChangeSchema).min(1).max(10),
});

export const llmLeverSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("cut"),
		monthlyAmount: reais,
		categoryIds: z.array(z.uuid()),
	}),
	z.object({
		kind: z.literal("redirect-pot"),
		accountId: z.uuid(),
		toPlanId: z.uuid(),
	}),
	z.object({ kind: z.literal("contribution"), deltaMonthly: reais }),
	z.object({
		kind: z.literal("shift-plan"),
		planId: z.uuid(),
		month: periodSchema,
	}),
]);

export const llmStressSchema = z.object({
	contributionCap: reais.optional(),
	incomeLossMonths: z.number().int().min(0).max(24).optional(),
	bidAtRangeMax: z.boolean().optional(),
	planCostPct: z.number().min(0).max(100).optional(),
});

export type LlmProposal = z.infer<typeof llmProposalSchema>;
export type LlmProposalChange = z.infer<typeof llmProposalChangeSchema>;
export type LlmLever = z.infer<typeof llmLeverSchema>;
export type LlmStress = z.infer<typeof llmStressSchema>;

type LlmPlanInput = z.infer<typeof llmPlanFieldsSchema>;
type LlmEvent = z.infer<typeof llmEventSchema>;
type LlmSettingsPatch = z.infer<typeof llmSettingsPatchSchema>;
type ProposalCreatePlan = Extract<ProposalChange, { op: "create-plan" }>;
type ProposalUpdatePlan = Extract<ProposalChange, { op: "update-plan" }>;
type ProposalEvent = Extract<ProposalChange, { op: "add-event" }>["event"];
type ProposalSettingsPatch = Extract<
	ProposalChange,
	{ op: "update-settings" }
>["patch"];

export function reaisToCents(
	value: number,
	opts: { allowNegative?: boolean } = {},
): Cents {
	if (!opts.allowNegative && value < 0) {
		throw new ProposalError("Valor não pode ser negativo.");
	}
	if (!Number.isFinite(value) || Number(value.toFixed(2)) !== value) {
		throw new ProposalError(
			"Use valores em reais com no máximo 2 casas decimais.",
		);
	}
	return toCents(value);
}

function toRange(range: LlmEvent["amount"]): AmountRange {
	return {
		min: reaisToCents(range.min),
		base: reaisToCents(range.base),
		max: reaisToCents(range.max),
	};
}

function toPlanFields(
	fields: LlmPlanInput["fields"],
): ProposalCreatePlan["plan"]["fields"] {
	if (fields.type === "goal") {
		return { ...fields, target: toRange(fields.target) };
	}
	return {
		...fields,
		letterValue: reaisToCents(fields.letterValue),
		outstandingBalance: reaisToCents(fields.outstandingBalance),
	};
}

function toPlanInput(plan: LlmPlanInput): ProposalCreatePlan["plan"] {
	return { ...plan, fields: toPlanFields(plan.fields) };
}

function toPlanPatch(
	patch: Partial<LlmPlanInput>,
): ProposalUpdatePlan["patch"] {
	const { fields, ...rest } = patch;
	return fields === undefined
		? rest
		: { ...rest, fields: toPlanFields(fields) };
}

function toEvent(event: LlmEvent): ProposalEvent {
	return { ...event, amount: toRange(event.amount) };
}

function toSettingsPatch(patch: LlmSettingsPatch): ProposalSettingsPatch {
	const { plannedContribution, ...rest } = patch;
	return plannedContribution === undefined
		? rest
		: { ...rest, plannedContribution: reaisToCents(plannedContribution) };
}

function toProposalChange(change: LlmProposalChange): ProposalChange {
	switch (change.op) {
		case "create-plan":
			return {
				...change,
				plan: toPlanInput(change.plan),
				events: change.events.map(toEvent),
			};
		case "update-plan":
			return { ...change, patch: toPlanPatch(change.patch) };
		case "add-event":
			return { ...change, event: toEvent(change.event) };
		case "update-settings":
			return { ...change, patch: toSettingsPatch(change.patch) };
		case "record-assumption":
			return change;
	}
}

export function parseLlmProposal(
	input: LlmProposal,
): { proposal: Proposal } | { error: string } {
	try {
		const result = proposalSchema.safeParse({
			...input,
			changes: input.changes.map(toProposalChange),
		});
		if (!result.success) {
			return { error: result.error.issues[0]?.message ?? "Proposta inválida." };
		}
		return { proposal: result.data };
	} catch (error) {
		if (error instanceof ProposalError) {
			return { error: error.message };
		}
		throw error;
	}
}

export function toLever(input: LlmLever): Lever {
	switch (input.kind) {
		case "cut":
			return { ...input, monthlyAmount: reaisToCents(input.monthlyAmount) };
		case "contribution":
			return {
				...input,
				deltaMonthly: reaisToCents(input.deltaMonthly, { allowNegative: true }),
			};
		case "redirect-pot":
		case "shift-plan":
			return input;
	}
}

export function toStress(input: LlmStress): StressToggles {
	const { contributionCap, ...rest } = input;
	return contributionCap === undefined
		? rest
		: { ...rest, contributionCap: reaisToCents(contributionCap) };
}
