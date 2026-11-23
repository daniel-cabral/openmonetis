"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { financialAccounts, plans } from "@/db/schema";
import {
	type PlanInput,
	planInputSchema,
	type ReorderPlansInput,
	reorderPlansSchema,
} from "@/features/planning/lib/schemas";
import {
	insertPlan,
	type PlanningTx,
	updatePlan,
} from "@/features/planning/lib/writes";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { uuidSchema } from "@/shared/lib/schemas/common";
import { errorResult } from "@/shared/lib/types/actions";

const NOT_FOUND_MESSAGE = "Registro não encontrado.";
const INVALID_POT_MESSAGE = "Pote inválido.";
const INVALID_ORDER_MESSAGE = "Ordem inválida.";

const planIdSchema = z.object({ id: uuidSchema("Plano") });

async function arePotsEarmarked(
	tx: PlanningTx,
	userId: string,
	potAccountIds: string[],
): Promise<boolean> {
	if (potAccountIds.length === 0) return true;

	const rows = await tx
		.select({ id: financialAccounts.id })
		.from(financialAccounts)
		.where(
			and(
				eq(financialAccounts.userId, userId),
				eq(financialAccounts.isEarmarkedPot, true),
				inArray(financialAccounts.id, potAccountIds),
			),
		);

	return new Set(rows.map((row) => row.id)).size === new Set(potAccountIds).size;
}

export async function createPlanAction(
	input: PlanInput,
): Promise<ActionResult<{ planId: string }>> {
	const userId = await getUserId();

	try {
		const data = planInputSchema.parse(input);

		const planId = await db.transaction(async (tx) => {
			if (!(await arePotsEarmarked(tx, userId, data.potAccountIds))) {
				return null;
			}
			return insertPlan(tx, userId, data);
		});

		if (!planId) return errorResult(INVALID_POT_MESSAGE);

		revalidateForEntity("planning", userId);
		return { success: true, message: "Plano criado.", data: { planId } };
	} catch (error) {
		return handleActionError(error) as ActionResult<{ planId: string }>;
	}
}

export async function updatePlanAction(
	input: PlanInput & { id: string },
): Promise<ActionResult> {
	const userId = await getUserId();

	try {
		const { id } = planIdSchema.parse(input);
		const data = planInputSchema.parse(input);

		const outcome = await db.transaction(async (tx) => {
			if (!(await arePotsEarmarked(tx, userId, data.potAccountIds))) {
				return "invalid-pot";
			}
			return (await updatePlan(tx, userId, id, data)) ? "saved" : "not-found";
		});

		if (outcome === "invalid-pot") return errorResult(INVALID_POT_MESSAGE);
		if (outcome === "not-found") return errorResult(NOT_FOUND_MESSAGE);

		revalidateForEntity("planning", userId);
		return { success: true, message: "Plano atualizado." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deletePlanAction(input: {
	id: string;
}): Promise<ActionResult> {
	const userId = await getUserId();

	try {
		const { id } = planIdSchema.parse(input);

		const deleted = await db.transaction((tx) =>
			tx
				.delete(plans)
				.where(and(eq(plans.id, id), eq(plans.userId, userId)))
				.returning({ id: plans.id }),
		);

		if (deleted.length === 0) return errorResult(NOT_FOUND_MESSAGE);

		revalidateForEntity("planning", userId);
		return { success: true, message: "Plano excluído." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function reorderPlansAction(
	input: ReorderPlansInput,
): Promise<ActionResult> {
	const userId = await getUserId();

	try {
		const data = reorderPlansSchema.parse(input);

		const reordered = await db.transaction(async (tx) => {
			const owned = await tx
				.select({ id: plans.id })
				.from(plans)
				.where(eq(plans.userId, userId));

			const ownedIds = owned.map((row) => row.id).sort();
			if (ownedIds.join(",") !== [...data.orderedIds].sort().join(",")) {
				return false;
			}

			for (const [index, id] of data.orderedIds.entries()) {
				await tx
					.update(plans)
					.set({ priority: index + 1 })
					.where(and(eq(plans.id, id), eq(plans.userId, userId)));
			}
			return true;
		});

		if (!reordered) return errorResult(INVALID_ORDER_MESSAGE);

		revalidateForEntity("planning", userId);
		return { success: true, message: "Ordem salva." };
	} catch (error) {
		return handleActionError(error);
	}
}
