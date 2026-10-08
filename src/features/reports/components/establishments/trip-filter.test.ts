import { describe, expect, it } from "vitest";
import { buildEstablishmentsTripSearch } from "./trip-filter";

describe("Estabelecimentos: query da viagem escolhida", () => {
	it.each([
		[
			"viagem específica preserva os demais parâmetros",
			"periodo=2026-10&meses=6",
			"abc",
			"periodo=2026-10&meses=6&viagem=abc",
		],
		["Sem viagens grava sem", "meses=3", "sem", "meses=3&viagem=sem"],
		[
			"Todos os lançamentos remove viagem da URL",
			"viagem=abc&meses=6",
			null,
			"meses=6",
		],
	])("%s", (_name, currentSearch, tripParam, expected) => {
		expect(buildEstablishmentsTripSearch(currentSearch, tripParam)).toBe(
			expected,
		);
	});
});
