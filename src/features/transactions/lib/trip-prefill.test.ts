import { describe, expect, it } from "vitest";
import type { TripOption } from "@/shared/lib/trips/types";
import { resolveAutoTripId } from "./trip-prefill";

const lisboa: TripOption = {
	id: "trip-lisboa",
	name: "Lisboa",
	startDate: "2026-05-12",
	endDate: "2026-05-22",
};
const base = {
	mode: "create" as const,
	touched: false,
	trips: [lisboa],
	purchaseDate: "2026-05-14",
	currentTripId: undefined,
};

describe("resolveAutoTripId", () => {
	it("compra em 14/05 vem com Lisboa", () => {
		expect(resolveAutoTripId(base)).toBe("trip-lisboa");
	});

	it("mudar a data para fora do intervalo limpa enquanto o usuário não mexeu", () => {
		expect(
			resolveAutoTripId({ ...base, purchaseDate: "2026-03-02", currentTripId: "trip-lisboa" }),
		).toBeUndefined();
	});

	it("escolha manual (passagem em 02/03) não é sobrescrita", () => {
		expect(
			resolveAutoTripId({
				...base,
				touched: true,
				purchaseDate: "2026-03-02",
				currentTripId: "trip-lisboa",
			}),
		).toBe("trip-lisboa");
	});

	it("limpar manualmente dentro do intervalo continua limpo", () => {
		expect(resolveAutoTripId({ ...base, touched: true, currentTripId: undefined })).toBeUndefined();
	});

	it("edição mostra o gravado e não recalcula", () => {
		expect(
			resolveAutoTripId({ ...base, mode: "update", currentTripId: undefined }),
		).toBeUndefined();
	});

	it("viagens ainda não carregadas não apagam nada", () => {
		expect(
			resolveAutoTripId({ ...base, trips: [], currentTripId: "trip-lisboa" }),
		).toBe("trip-lisboa");
	});
});
