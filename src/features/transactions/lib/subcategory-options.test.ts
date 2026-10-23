import { describe, expect, it } from "vitest";
import { buildOptionSets, buildSluggedFilters } from "./page-helpers";
import { getSubcategoryOptions } from "./subcategory-options";

const MORADIA = "11111111-1111-4111-8111-111111111111";
const TRANSPORTE = "22222222-2222-4222-8222-222222222222";
const ALUGUEL = "33333333-3333-4333-8333-333333333333";
const FAXINA = "44444444-4444-4444-8444-444444444444";

const category = (
	id: string,
	name: string,
	subcategories?: { id: string; name: string }[],
) => ({
	id,
	name,
	type: "Despesa",
	icon: null,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	userId: "user-1",
	subcategories,
});

const { categoryOptions } = buildOptionSets({
	...buildSluggedFilters({
		payerRows: [],
		accountRows: [],
		cardRows: [],
		categoryRows: [
			category(MORADIA, "Moradia", [
				{ id: ALUGUEL, name: "Aluguel" },
				{ id: FAXINA, name: "Faxina" },
			]),
			category(TRANSPORTE, "Transporte"),
		],
	}),
	payerRows: [],
});

describe("getSubcategoryOptions", () => {
	it("lista só as subcategorias da categoria escolhida e nada sem categoria ou sem subcategorias", () => {
		expect(getSubcategoryOptions(categoryOptions, MORADIA)).toEqual([
			{ id: ALUGUEL, name: "Aluguel" },
			{ id: FAXINA, name: "Faxina" },
		]);
		expect(getSubcategoryOptions(categoryOptions, TRANSPORTE)).toEqual([]);
		expect(getSubcategoryOptions(categoryOptions, null)).toEqual([]);
	});
});
