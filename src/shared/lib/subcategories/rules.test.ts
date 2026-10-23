import { describe, expect, it } from "vitest";
import {
	resolveSubcategoryId,
	validateSubcategoryPairs,
} from "@/shared/lib/subcategories/rules";

const MORADIA = "11111111-1111-4111-8111-111111111111";
const TRANSPORTE = "22222222-2222-4222-8222-222222222222";
const FAXINA = "33333333-3333-4333-8333-333333333333";

const parents = new Map([[FAXINA, MORADIA]]);

describe("resolveSubcategoryId", () => {
	it.each([
		[
			"id valido",
			FAXINA,
			MORADIA,
			parents,
			null,
			{ ok: true, subcategoryId: FAXINA },
		],
		[
			"id de outra categoria",
			FAXINA,
			TRANSPORTE,
			parents,
			null,
			{ ok: false, error: "A subcategoria não pertence à categoria escolhida." },
		],
		[
			"id desconhecido",
			FAXINA,
			MORADIA,
			new Map<string, string>(),
			null,
			{ ok: false, error: "Subcategoria não encontrada." },
		],
		[
			"null limpa",
			null,
			MORADIA,
			new Map<string, string>(),
			{ categoryId: MORADIA, subcategoryId: FAXINA },
			{ ok: true, subcategoryId: null },
		],
		[
			"ausente e mesma categoria mantem",
			undefined,
			MORADIA,
			new Map<string, string>(),
			{ categoryId: MORADIA, subcategoryId: FAXINA },
			{ ok: true, subcategoryId: FAXINA },
		],
		[
			"ausente e categoria trocada limpa",
			undefined,
			TRANSPORTE,
			new Map<string, string>(),
			{ categoryId: MORADIA, subcategoryId: FAXINA },
			{ ok: true, subcategoryId: null },
		],
		[
			"ausente sem registro anterior",
			undefined,
			MORADIA,
			new Map<string, string>(),
			null,
			{ ok: true, subcategoryId: null },
		],
	])("%s", (_, requested, categoryId, parentsMap, existing, expected) => {
		expect(
			resolveSubcategoryId({
				requested,
				categoryId,
				parents: parentsMap,
				existing,
			}),
		).toEqual(expected);
	});
});

describe("validateSubcategoryPairs", () => {
	it("aceita pares sem subcategoria e devolve o primeiro erro do lote", () => {
		expect(
			validateSubcategoryPairs(
				[
					{ categoryId: MORADIA, subcategoryId: FAXINA },
					{ categoryId: TRANSPORTE, subcategoryId: null },
				],
				parents,
			),
		).toBeNull();
		expect(
			validateSubcategoryPairs(
				[
					{ categoryId: MORADIA, subcategoryId: FAXINA },
					{ categoryId: TRANSPORTE, subcategoryId: FAXINA },
				],
				parents,
			),
		).toBe("A subcategoria não pertence à categoria escolhida.");
	});
});
