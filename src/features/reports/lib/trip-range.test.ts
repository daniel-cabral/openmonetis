import { describe, expect, it } from "vitest";
import {
	buildResetSearchParams,
	buildTripSearchParams,
	resolveTripRange,
} from "./trip-range";
import { validateDateRange } from "./utils";

const current = { startPeriod: "2026-05", endPeriod: "2026-10" };

describe("resolveTripRange", () => {
	it.each([
		[
			"passagem parcelada estende o intervalo",
			{ startPeriod: "2026-03", endPeriod: "2026-12" },
			{ startPeriod: "2026-03", endPeriod: "2026-12" },
		],
		["viagem sem lançamentos mantém o intervalo atual", undefined, current],
		[
			"acima de 24 meses corta o fim",
			{ startPeriod: "2025-01", endPeriod: "2027-06" },
			{ startPeriod: "2025-01", endPeriod: "2026-12" },
		],
		[
			"viagem num único mês",
			{ startPeriod: "2025-09", endPeriod: "2025-09" },
			{ startPeriod: "2025-09", endPeriod: "2025-09" },
		],
	])("%s", (_label, range, expected) => {
		const result = resolveTripRange(range, current);
		expect(result).toEqual(expected);
		expect(
			validateDateRange(result.startPeriod, result.endPeriod).isValid,
		).toBe(true);
	});
});

describe("buildTripSearchParams", () => {
	const range = { startPeriod: "2026-03", endPeriod: "2026-12" };

	it("grava viagem e intervalo preservando categorias e aba", () => {
		const params = new URLSearchParams(
			buildTripSearchParams(
				"inicio=2026-05&fim=2026-10&categorias=a,b&aba=chart",
				"lisboa-id",
				range,
			),
		);
		expect(params.get("viagem")).toBe("lisboa-id");
		expect(params.get("inicio")).toBe("2026-03");
		expect(params.get("fim")).toBe("2026-12");
		expect(params.get("categorias")).toBe("a,b");
		expect(params.get("aba")).toBe("chart");
	});

	it("Todos os lançamentos remove o parâmetro viagem", () => {
		const params = new URLSearchParams(
			buildTripSearchParams(
				"viagem=sem&inicio=2026-05&fim=2026-10",
				null,
				current,
			),
		);
		expect(params.has("viagem")).toBe(false);
		expect(params.get("inicio")).toBe("2026-05");
	});
});

describe("buildResetSearchParams", () => {
	it("Limpar volta viagem para Todos, limpa categorias e preserva aba", () => {
		const params = new URLSearchParams(
			buildResetSearchParams(
				"viagem=lisboa-id&inicio=2026-03&fim=2026-12&categorias=a&aba=chart",
				{ startPeriod: "2026-05", endPeriod: "2026-10" },
			),
		);
		expect(params.has("viagem")).toBe(false);
		expect(params.has("categorias")).toBe(false);
		expect(params.get("inicio")).toBe("2026-05");
		expect(params.get("fim")).toBe("2026-10");
		expect(params.get("aba")).toBe("chart");
	});
});
