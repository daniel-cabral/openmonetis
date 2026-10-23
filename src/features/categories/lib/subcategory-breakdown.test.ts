import { describe, expect, it } from "vitest";
import {
	buildSubcategoryBreakdown,
	filterTransactionsBySubcategory,
} from "@/features/categories/lib/subcategory-breakdown";
import type { SubcategoryOption } from "@/shared/lib/subcategories/types";

const ALUGUEL = "11111111-1111-4111-8111-111111111111";
const CONDOMINIO = "22222222-2222-4222-8222-222222222222";
const FAXINA = "33333333-3333-4333-8333-333333333333";
const IPTU = "44444444-4444-4444-8444-444444444444";
const DELETADA = "55555555-5555-4555-8555-555555555555";

const aluguel: SubcategoryOption = { id: ALUGUEL, name: "Aluguel" };
const condominio: SubcategoryOption = { id: CONDOMINIO, name: "Condomínio" };
const faxina: SubcategoryOption = { id: FAXINA, name: "Faxina" };
const iptu: SubcategoryOption = { id: IPTU, name: "IPTU" };

describe("buildSubcategoryBreakdown", () => {
	it("ordena por valor e fecha em 100% com a linha Sem subcategoria", () => {
		const transactions = [
			{ amount: -2800, subcategoryId: ALUGUEL },
			{ amount: -650, subcategoryId: CONDOMINIO },
			{ amount: -240, subcategoryId: FAXINA },
			{ amount: -240, subcategoryId: FAXINA },
			{ amount: -312.4, subcategoryId: IPTU },
			{ amount: -189.9, subcategoryId: null },
		];

		expect(
			buildSubcategoryBreakdown(transactions, [
				aluguel,
				condominio,
				faxina,
				iptu,
			]),
		).toEqual([
			{ subcategoryId: ALUGUEL, name: "Aluguel", amount: 2800, percent: 63.2 },
			{
				subcategoryId: CONDOMINIO,
				name: "Condomínio",
				amount: 650,
				percent: 14.7,
			},
			{ subcategoryId: FAXINA, name: "Faxina", amount: 480, percent: 10.8 },
			{ subcategoryId: IPTU, name: "IPTU", amount: 312.4, percent: 7 },
			{
				subcategoryId: null,
				name: "Sem subcategoria",
				amount: 189.9,
				percent: 4.3,
			},
		]);
	});

	it("subcategorias cadastradas sem uso no mes viram uma linha Sem subcategoria a 100%", () => {
		expect(
			buildSubcategoryBreakdown(
				[{ amount: -50, subcategoryId: null }],
				[faxina],
			),
		).toEqual([
			{
				subcategoryId: null,
				name: "Sem subcategoria",
				amount: 50,
				percent: 100,
			},
		]);
	});

	it("sem subcategorias cadastradas devolve lista vazia", () => {
		expect(
			buildSubcategoryBreakdown([{ amount: -50, subcategoryId: null }], []),
		).toEqual([]);
	});

	it("total zero devolve percentual 0 em vez de NaN", () => {
		expect(
			buildSubcategoryBreakdown([{ amount: 0, subcategoryId: null }], [faxina]),
		).toEqual([
			{ subcategoryId: null, name: "Sem subcategoria", amount: 0, percent: 0 },
		]);
	});
});

describe("filterTransactionsBySubcategory", () => {
	const transactions = [
		{ id: "t1", subcategoryId: FAXINA },
		{ id: "t2", subcategoryId: FAXINA },
		{ id: "t3", subcategoryId: ALUGUEL },
		{ id: "t4", subcategoryId: null },
	];
	const subcategories = [aluguel, faxina];

	it.each([
		["id de subcategoria mantem so as linhas dela", FAXINA, ["t1", "t2"]],
		["sem mantem so as linhas sem subcategoria", "sem", ["t4"]],
		["sem filtro devolve todas", null, ["t1", "t2", "t3", "t4"]],
		[
			"id deletado devolve todas (filtro obsoleto na URL)",
			DELETADA,
			["t1", "t2", "t3", "t4"],
		],
	])("%s", (_, filter, expectedIds) => {
		expect(
			filterTransactionsBySubcategory(transactions, filter, subcategories).map(
				(transaction) => transaction.id,
			),
		).toEqual(expectedIds);
	});
});
