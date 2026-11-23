"use server";

import { eq } from "drizzle-orm";
import { planningSettings } from "@/db/schema";
import { toSettingsInput } from "@/features/planning/lib/mappers";
import {
	type PlanningSettingsInput,
	planningSettingsFieldsSchema,
} from "@/features/planning/lib/schemas";
import { changedAssumptions } from "@/features/planning/lib/settings-assumptions";
import {
	insertAssumption,
	upsertSettings,
} from "@/features/planning/lib/writes";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";

export async function savePlanningSettingsAction(
	input: PlanningSettingsInput,
): Promise<ActionResult> {
	const userId = await getUserId();

	try {
		const settings = planningSettingsFieldsSchema.parse(input);

		await db.transaction(async (tx) => {
			const [previousRow] = await tx
				.select()
				.from(planningSettings)
				.where(eq(planningSettings.userId, userId));
			const previous = toSettingsInput(previousRow);

			await upsertSettings(tx, userId, settings);
			for (const entry of changedAssumptions(previous, settings)) {
				await insertAssumption(tx, userId, { ...entry, source: "user" });
			}
		});

		revalidateForEntity("planning", userId);
		return { success: true, message: "Ajustes salvos." };
	} catch (error) {
		return handleActionError(error);
	}
}
