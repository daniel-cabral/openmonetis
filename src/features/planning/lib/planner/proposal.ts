import { z } from "zod";
import type {
	EngineInput,
	EnginePlan,
} from "@/features/planning/lib/engine";
import {
	assumptionInputSchema,
	planEventFieldsSchema,
	planFieldsSchema,
	planInputSchema,
	planningSettingsFieldsSchema,
} from "@/features/planning/lib/schemas";
import { createClientSafeId } from "@/shared/utils/id";

export const proposalChangeSchema = z.discriminatedUnion("op", [
	z.object({
		op: z.literal("create-plan"),
		plan: planInputSchema,
		events: z.array(planEventFieldsSchema).max(10).default([]),
	}),
	z.object({
		op: z.literal("update-plan"),
		planId: z.uuid(),
		patch: planFieldsSchema.partial(),
	}),
	z.object({
		op: z.literal("add-event"),
		planId: z.uuid(),
		event: planEventFieldsSchema,
	}),
	z.object({
		op: z.literal("update-settings"),
		patch: planningSettingsFieldsSchema
			.pick({
				plannedContribution: true,
				reserveMonths: true,
				indexForecastPct: true,
			})
			.partial(),
	}),
	z.object({
		op: z.literal("record-assumption"),
		assumption: assumptionInputSchema,
	}),
]);

export const proposalSchema = z.object({
	title: z.string().min(1).max(120),
	rationale: z.string().max(1000),
	changes: z.array(proposalChangeSchema).min(1).max(10),
});

export type ProposalChange = z.infer<typeof proposalChangeSchema>;
export type Proposal = z.infer<typeof proposalSchema>;

export class ProposalError extends Error {}

export function applyChangesToInput(
	input: EngineInput,
	changes: ProposalChange[],
	newId: (index: number) => string = () => createClientSafeId(),
): EngineInput {
	let generated = 0;
	const nextId = () => newId(generated++);

	return changes.reduce(
		(current, change) => applyChange(current, change, nextId),
		input,
	);
}

function applyChange(
	input: EngineInput,
	change: ProposalChange,
	nextId: () => string,
): EngineInput {
	switch (change.op) {
		case "create-plan": {
			const priority =
				input.plans.reduce((max, plan) => Math.max(max, plan.priority), 0) + 1;
			const plan: EnginePlan = {
				...change.plan,
				id: nextId(),
				priority,
				events: change.events.map((event) => ({ ...event, id: nextId() })),
				bidHistory: [],
				mappedMonthlyOutflow: 0,
			};
			return { ...input, plans: [...input.plans, plan] };
		}
		case "update-plan": {
			const stored = findPlan(input, change.planId);
			const merged = planInputSchema.safeParse({ ...stored, ...change.patch });
			if (!merged.success) {
				throw new ProposalError(
					merged.error.issues[0]?.message ?? "Plano inválido.",
				);
			}
			return replacePlan(input, { ...stored, ...merged.data });
		}
		case "add-event": {
			const plan = findPlan(input, change.planId);
			return replacePlan(input, {
				...plan,
				events: [...plan.events, { ...change.event, id: nextId() }],
			});
		}
		case "update-settings":
			return {
				...input,
				reserveMonths: change.patch.reserveMonths ?? input.reserveMonths,
				indexForecastPct: change.patch.indexForecastPct ?? input.indexForecastPct,
			};
		case "record-assumption":
			return input;
	}
}

function findPlan(input: EngineInput, planId: string): EnginePlan {
	const plan = input.plans.find((candidate) => candidate.id === planId);
	if (!plan) {
		throw new ProposalError("Plano não encontrado.");
	}
	return plan;
}

function replacePlan(input: EngineInput, plan: EnginePlan): EngineInput {
	return {
		...input,
		plans: input.plans.map((candidate) =>
			candidate.id === plan.id ? plan : candidate,
		),
	};
}
