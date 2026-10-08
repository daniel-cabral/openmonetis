import { describe, expect, it } from "vitest";
import type { TripOption } from "@/shared/lib/trips/types";
import { buildOverlapMessage, findOverlappingTrip } from "./overlap";
import { createTripSchema, updateTripSchema } from "./schemas";

const lisboa: TripOption = {
	id: "11111111-1111-4111-8111-111111111111",
	name: "Lisboa",
	startDate: "2026-05-12",
	endDate: "2026-05-22",
};

describe("findOverlappingTrip", () => {
	it.each([
		["Porto cruza Lisboa", "2026-05-20", "2026-05-25", "Lisboa"],
		["começa no dia em que Lisboa termina", "2026-05-22", "2026-05-24", "Lisboa"],
		["termina no dia em que Lisboa começa", "2026-05-01", "2026-05-12", "Lisboa"],
		["contém Lisboa inteira", "2026-05-01", "2026-05-30", "Lisboa"],
		["começa no dia seguinte", "2026-05-23", "2026-05-25", undefined],
		["termina na véspera", "2026-05-01", "2026-05-11", undefined],
	])("%s", (_, startDate, endDate, expected) => {
		expect(findOverlappingTrip({ startDate, endDate }, [lisboa])?.name).toBe(
			expected,
		);
	});

	it("editar a própria viagem não conflita com ela mesma", () => {
		expect(
			findOverlappingTrip(
				{ id: lisboa.id, startDate: "2026-05-10", endDate: "2026-05-22" },
				[lisboa],
			),
		).toBeUndefined();
	});

	it("mensagem cita a viagem em conflito", () => {
		const message = buildOverlapMessage(lisboa);
		expect(message).toContain('"Lisboa"');
		expect(message).toContain("12/05/2026");
		expect(message).toContain("22/05/2026");
	});
});

describe("createTripSchema", () => {
	const valid = {
		name: " Lisboa ",
		startDate: "2026-05-12",
		endDate: "2026-05-22",
	};

	it("aceita viagem de um dia e normaliza nome e anotação vazia", () => {
		const parsed = createTripSchema.parse({
			...valid,
			endDate: "2026-05-12",
			note: "  ",
		});
		expect(parsed.name).toBe("Lisboa");
		expect(parsed.note).toBeNull();
	});

	it.each([
		[
			{ ...valid, endDate: "2026-05-11" },
			"A data de fim deve ser igual ou posterior à data de início.",
		],
		[
			{ ...valid, startDate: "2026-02-31" },
			"Informe uma data de início válida.",
		],
		[{ ...valid, endDate: "22/05/2026" }, "Informe uma data de fim válida."],
		[{ ...valid, name: "   " }, "Informe o nome da viagem."],
	])("rejeita %o", (input, message) => {
		const result = createTripSchema.safeParse(input);
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe(message);
	});

	it("update exige id válido", () => {
		expect(updateTripSchema.safeParse({ ...valid, id: "x" }).success).toBe(
			false,
		);
	});
});
