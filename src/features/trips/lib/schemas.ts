import { z } from "zod";
import { uuidSchema } from "@/shared/lib/schemas/common";
import { parseLocalDateString, toLocalDateString } from "@/shared/utils/date";

// Rejects malformed strings and impossible dates such as 2026-02-31.
const isRealDate = (value: string) =>
	/^\d{4}-\d{2}-\d{2}$/.test(value) &&
	toLocalDateString(parseLocalDateString(value)) === value;

const dateOnly = (message: string) =>
	z.string({ message }).trim().refine(isRealDate, { message });

const tripFields = z
	.object({
		name: z
			.string({ message: "Informe o nome da viagem." })
			.trim()
			.min(1, "Informe o nome da viagem.")
			.max(60, "O nome deve ter no máximo 60 caracteres."),
		startDate: dateOnly("Informe uma data de início válida."),
		endDate: dateOnly("Informe uma data de fim válida."),
		note: z
			.string()
			.trim()
			.max(500, "A anotação deve ter no máximo 500 caracteres.")
			.nullish()
			.transform((value) => (value ? value : null)),
	})
	.refine((data) => data.startDate <= data.endDate, {
		message: "A data de fim deve ser igual ou posterior à data de início.",
		path: ["endDate"],
	});

export const createTripSchema = tripFields;
export const updateTripSchema = tripFields.and(
	z.object({ id: uuidSchema("Viagem") }),
);
export const deleteTripSchema = z.object({ id: uuidSchema("Viagem") });

export type CreateTripInput = z.input<typeof createTripSchema>;
export type UpdateTripInput = z.input<typeof updateTripSchema>;
export type DeleteTripInput = z.input<typeof deleteTripSchema>;
