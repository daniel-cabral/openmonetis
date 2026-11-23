"use server";

import { eq } from "drizzle-orm";
import { planningSettings } from "@/db/schema";
import { toSettingsInput } from "@/features/planning/lib/mappers";
import {
	type AssumptionInput,
	type PlanningSettingsInput,
	planningSettingsFieldsSchema,
} from "@/features/planning/lib/schemas";
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
import { currencyFormatter } from "@/shared/utils/currency";

function formatPct(value: number): string {
	return `${value.toFixed(2).replace(".", ",")}%`;
}

function changedAssumptions(
	previous: PlanningSettingsInput,
	next: PlanningSettingsInput,
): AssumptionInput[] {
	const entries: AssumptionInput[] = [];

	if (next.plannedContribution !== previous.plannedContribution) {
		const from = currencyFormatter.format(previous.plannedContribution / 100);
		const to = currencyFormatter.format(next.plannedContribution / 100);
		entries.push({
			kind: "contribution",
			summary: `Aporte planejado: ${from} → ${to} por mês`,
			reviewByMonth: null,
		});
	}

	for (const index of ["IPCA", "INCC"] as const) {
		if (next.indexForecastPct[index] !== previous.indexForecastPct[index]) {
			entries.push({
				kind: "index",
				summary: `Previsão de ${index}: ${formatPct(previous.indexForecastPct[index])} → ${formatPct(next.indexForecastPct[index])} ao ano`,
				reviewByMonth: null,
			});
		}
	}

	return entries;
}

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
