"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assumptionLog } from "@/db/schema";
import { toEnginePlan } from "@/features/planning/lib/mappers";
import { createConversation } from "@/features/planning/lib/planner/conversation-store";
import {
	type Proposal,
	ProposalError,
	type ProposalChange,
	proposalSchema,
} from "@/features/planning/lib/planner/proposal";
import { planInputSchema } from "@/features/planning/lib/schemas";
import {
	arePotsEarmarked,
	assertOwnedPlan,
	insertAssumption,
	insertPlan,
	insertPlanEvent,
	type PlanningTx,
	updatePlan,
	upsertSettings,
} from "@/features/planning/lib/writes";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { errorResult } from "@/shared/lib/types/actions";

const NOT_FOUND_MESSAGE = "Registro não encontrado.";
const ALREADY_APPLIED_MESSAGE = "Proposta já aplicada.";
const INVALID_POT_MESSAGE = "Pote inválido.";

const applyProposalSchema = z.object({
	proposalId: z.string().min(1).max(200),
	proposal: proposalSchema,
});

const startConversationSchema = z.object({
	title: z.string().trim().min(1).max(120).optional(),
});

async function applyProposalChange(
	tx: PlanningTx,
	userId: string,
	change: ProposalChange,
): Promise<void> {
	switch (change.op) {
		case "create-plan": {
			if (!(await arePotsEarmarked(tx, userId, change.plan.potAccountIds))) {
				throw new ProposalError(INVALID_POT_MESSAGE);
			}
			const planId = await insertPlan(tx, userId, change.plan);
			for (const event of change.events) {
				await insertPlanEvent(tx, userId, planId, event);
			}
			return;
		}
		case "update-plan": {
			const stored = await assertOwnedPlan(tx, userId, change.planId);
			if (!stored) throw new ProposalError(NOT_FOUND_MESSAGE);

			const merged = planInputSchema.safeParse({
				...toEnginePlan(stored, [], [], 0),
				...change.patch,
			});
			if (!merged.success) {
				throw new ProposalError(
					merged.error.issues[0]?.message ?? "Plano inválido.",
				);
			}
			if (!(await arePotsEarmarked(tx, userId, merged.data.potAccountIds))) {
				throw new ProposalError(INVALID_POT_MESSAGE);
			}
			await updatePlan(tx, userId, change.planId, merged.data);
			return;
		}
		case "add-event": {
			const plan = await assertOwnedPlan(tx, userId, change.planId);
			if (!plan) throw new ProposalError(NOT_FOUND_MESSAGE);

			await insertPlanEvent(tx, userId, change.planId, change.event);
			return;
		}
		case "update-settings":
			await upsertSettings(tx, userId, change.patch);
			return;
		case "record-assumption":
			// Written after the plan changes, in applyProposalAction.
			return;
	}
}

export async function applyProposalAction(input: {
	proposalId: string;
	proposal: Proposal;
}): Promise<ActionResult> {
	const userId = await getUserId();

	try {
		const { proposalId, proposal } = applyProposalSchema.parse(input);

		const outcome = await db.transaction(async (tx) => {
			const [applied] = await tx
				.select({ id: assumptionLog.id })
				.from(assumptionLog)
				.where(
					and(
						eq(assumptionLog.userId, userId),
						eq(assumptionLog.proposalId, proposalId),
					),
				)
				.limit(1);
			if (applied) return "already-applied";

			for (const change of proposal.changes) {
				await applyProposalChange(tx, userId, change);
			}

			await insertAssumption(tx, userId, {
				kind: "plan-change",
				summary: proposal.title,
				reviewByMonth: null,
				source: "planner",
				proposalId,
			});
			for (const change of proposal.changes) {
				if (change.op !== "record-assumption") continue;
				await insertAssumption(tx, userId, {
					...change.assumption,
					source: "planner",
					proposalId,
				});
			}
			return "applied";
		});

		if (outcome === "already-applied") {
			return errorResult(ALREADY_APPLIED_MESSAGE);
		}

		revalidateForEntity("planning", userId);
		return { success: true, message: "Proposta aplicada." };
	} catch (error) {
		if (error instanceof ProposalError) return errorResult(error.message);
		return handleActionError(error);
	}
}

export async function startPlannerConversationAction(input: {
	title?: string;
}): Promise<ActionResult<{ conversationId: string }>> {
	const userId = await getUserId();

	try {
		const { title } = startConversationSchema.parse(input);
		const conversationId = await createConversation(
			userId,
			title ?? `Conversa de ${new Date().toLocaleDateString("pt-BR")}`,
		);
		return {
			success: true,
			message: "Conversa iniciada.",
			data: { conversationId },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{ conversationId: string }>;
	}
}
