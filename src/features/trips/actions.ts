"use server";

import { and, eq } from "drizzle-orm";
import { trips } from "@/db/schema";
import {
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { fetchUserTrips } from "@/shared/lib/trips/queries";
import type { ActionResult } from "@/shared/lib/types/actions";
import { parseLocalDateString } from "@/shared/utils/date";
import { buildOverlapMessage, findOverlappingTrip } from "./lib/overlap";
import {
	type CreateTripInput,
	createTripSchema,
	type DeleteTripInput,
	deleteTripSchema,
	type UpdateTripInput,
	updateTripSchema,
} from "./lib/schemas";

const NOT_FOUND = "Viagem não encontrada.";

export async function createTripAction(
	input: CreateTripInput,
): Promise<ActionResult<{ tripId: string }>> {
	try {
		const user = await getUser();
		const data = createTripSchema.parse(input);

		const overlap = findOverlappingTrip(data, await fetchUserTrips(user.id));
		if (overlap) return { success: false, error: buildOverlapMessage(overlap) };

		const [created] = await db
			.insert(trips)
			.values({
				userId: user.id,
				name: data.name,
				startDate: parseLocalDateString(data.startDate),
				endDate: parseLocalDateString(data.endDate),
				note: data.note,
			})
			.returning({ id: trips.id });

		revalidateForEntity("trips", user.id);
		return {
			success: true,
			message: "Viagem criada.",
			data: { tripId: created.id },
		};
	} catch (error) {
		const result = handleActionError(error);
		return {
			success: false,
			error: result.success ? "Ocorreu um erro inesperado." : result.error,
		};
	}
}

export async function updateTripAction(
	input: UpdateTripInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updateTripSchema.parse(input);

		const overlap = findOverlappingTrip(data, await fetchUserTrips(user.id));
		if (overlap) return { success: false, error: buildOverlapMessage(overlap) };

		// Changing dates never unlinks transactions (D7).
		const updated = await db
			.update(trips)
			.set({
				name: data.name,
				startDate: parseLocalDateString(data.startDate),
				endDate: parseLocalDateString(data.endDate),
				note: data.note,
			})
			.where(and(eq(trips.id, data.id), eq(trips.userId, user.id)))
			.returning({ id: trips.id });

		if (updated.length === 0) {
			return { success: false, error: NOT_FOUND };
		}

		revalidateForEntity("trips", user.id);
		return { success: true, message: "Viagem atualizada." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deleteTripAction(
	input: DeleteTripInput,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = deleteTripSchema.parse(input);

		// FK "on delete set null" keeps the transactions, just without a trip (D8).
		const deleted = await db
			.delete(trips)
			.where(and(eq(trips.id, data.id), eq(trips.userId, user.id)))
			.returning({ id: trips.id });

		if (deleted.length === 0) {
			return { success: false, error: NOT_FOUND };
		}

		revalidateForEntity("trips", user.id);
		return {
			success: true,
			message:
				"Viagem excluída. Os lançamentos continuam existindo, sem viagem.",
		};
	} catch (error) {
		return handleActionError(error);
	}
}
