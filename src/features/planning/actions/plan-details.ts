"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	bidRecords,
	categories,
	planCategoryMappings,
	planEvents,
} from "@/db/schema";
import {
	type AssumptionInput,
	assumptionInputSchema,
	type BidInput,
	bidInputSchema,
	type CategoryMappingInput,
	categoryMappingInputSchema,
	type PlanEventInputData,
	planEventInputSchema,
} from "@/features/planning/lib/schemas";
import {
	assertOwnedPlan,
	insertAssumption,
	insertPlanEvent,
	updatePlanEvent,
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
const BID_NOT_CONSORCIO_MESSAGE = "Lance só vale para consórcio.";

const idSchema = z.object({ id: uuidSchema("Evento") });

export async function savePlanEventAction(
	input: PlanEventInputData,
): Promise<ActionResult<{ eventId: string }>> {
	const userId = await getUserId();

	try {
		const data = planEventInputSchema.parse(input);

		const eventId = await db.transaction(async (tx) => {
			if (!(await assertOwnedPlan(tx, userId, data.planId))) return null;

			if (data.id) {
				const updated = await updatePlanEvent(
					tx,
					userId,
					data.planId,
					data.id,
					data,
				);
				return updated ? data.id : null;
			}
			return insertPlanEvent(tx, userId, data.planId, data);
		});

		if (!eventId) {
			return errorResult(NOT_FOUND_MESSAGE) as ActionResult<{
				eventId: string;
			}>;
		}

		revalidateForEntity("planning", userId);
		return { success: true, message: "Evento salvo.", data: { eventId } };
	} catch (error) {
		return handleActionError(error) as ActionResult<{ eventId: string }>;
	}
}

export async function deletePlanEventAction(input: {
	id: string;
}): Promise<ActionResult> {
	const userId = await getUserId();

	try {
		const { id } = idSchema.parse(input);

		const deleted = await db.transaction((tx) =>
			tx
				.delete(planEvents)
				.where(and(eq(planEvents.id, id), eq(planEvents.userId, userId)))
				.returning({ id: planEvents.id }),
		);

		if (deleted.length === 0) return errorResult(NOT_FOUND_MESSAGE);

		revalidateForEntity("planning", userId);
		return { success: true, message: "Evento excluído." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function recordWinningBidAction(
	input: BidInput,
): Promise<ActionResult> {
	const userId = await getUserId();

	try {
		const data = bidInputSchema.parse(input);
		const winningBidPct = data.winningBidPct.toFixed(2);

		const outcome = await db.transaction(async (tx) => {
			const plan = await assertOwnedPlan(tx, userId, data.planId);
			if (!plan) return "not-found";
			if (plan.type !== "consorcio") return "not-consorcio";

			await tx
				.insert(bidRecords)
				.values({
					userId,
					planId: data.planId,
					month: data.month,
					winningBidPct,
				})
				.onConflictDoUpdate({
					target: [bidRecords.planId, bidRecords.month],
					set: { winningBidPct },
				});
			return "saved";
		});

		if (outcome === "not-found") return errorResult(NOT_FOUND_MESSAGE);
		if (outcome === "not-consorcio") {
			return errorResult(BID_NOT_CONSORCIO_MESSAGE);
		}

		revalidateForEntity("planning", userId);
		return { success: true, message: "Lance registrado." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function setPlanCategoryMappingsAction(
	input: CategoryMappingInput,
): Promise<ActionResult> {
	const userId = await getUserId();

	try {
		const data = categoryMappingInputSchema.parse(input);
		const categoryIds = [...new Set(data.categoryIds)];

		const saved = await db.transaction(async (tx) => {
			if (!(await assertOwnedPlan(tx, userId, data.planId))) return false;

			if (categoryIds.length > 0) {
				const owned = await tx
					.select({ id: categories.id })
					.from(categories)
					.where(
						and(
							eq(categories.userId, userId),
							inArray(categories.id, categoryIds),
						),
					);
				if (owned.length !== categoryIds.length) return false;

				// A category maps to one plan per user, so it moves off any other plan.
				await tx
					.delete(planCategoryMappings)
					.where(
						and(
							eq(planCategoryMappings.userId, userId),
							inArray(planCategoryMappings.categoryId, categoryIds),
						),
					);
			}

			await tx
				.delete(planCategoryMappings)
				.where(
					and(
						eq(planCategoryMappings.userId, userId),
						eq(planCategoryMappings.planId, data.planId),
					),
				);

			if (categoryIds.length > 0) {
				await tx.insert(planCategoryMappings).values(
					categoryIds.map((categoryId) => ({
						userId,
						planId: data.planId,
						categoryId,
					})),
				);
			}
			return true;
		});

		if (!saved) return errorResult(NOT_FOUND_MESSAGE);

		revalidateForEntity("planning", userId);
		return { success: true, message: "Categorias do plano salvas." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function addAssumptionAction(
	input: AssumptionInput,
): Promise<ActionResult> {
	const userId = await getUserId();

	try {
		const data = assumptionInputSchema.parse(input);

		await db.transaction((tx) =>
			insertAssumption(tx, userId, { ...data, source: "user" }),
		);

		revalidateForEntity("planning", userId);
		return { success: true, message: "Premissa registrada." };
	} catch (error) {
		return handleActionError(error);
	}
}
