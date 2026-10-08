import { describe, expect, it } from "vitest";
import { toTripFormValues } from "./trip-form";

describe("toTripFormValues", () => {
	it("comeca vazio ao criar e preenche com a viagem ao editar", () => {
		expect(toTripFormValues()).toEqual({
			name: "",
			startDate: "",
			endDate: "",
			note: "",
		});

		expect(
			toTripFormValues({
				id: "11111111-1111-4111-8111-111111111111",
				name: "Lisboa",
				startDate: "2026-05-12",
				endDate: "2026-05-22",
				note: null,
			}),
		).toEqual({
			name: "Lisboa",
			startDate: "2026-05-12",
			endDate: "2026-05-22",
			note: "",
		});
	});
});
