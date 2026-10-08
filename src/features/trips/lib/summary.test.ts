import { describe, expect, it } from "vitest";
import { summarizeTrip, type TripTransactionRow } from "./summary";

const ADMIN = "admin";
const ANA = "ana";

const row = (overrides: Partial<TripTransactionRow>): TripTransactionRow => ({
	id: overrides.id ?? "r",
	name: "x",
	purchaseDate: "2026-05-14",
	amount: -10,
	transactionType: "Despesa",
	payerId: ADMIN,
	payerName: "Eu",
	categoryName: "Restaurantes",
	cardName: "C6",
	accountName: null,
	currentInstallment: null,
	installmentCount: null,
	seriesId: null,
	splitGroupId: null,
	...overrides,
});

describe("summarizeTrip", () => {
	it("reembolso abate o total (9.212,30 - 800,00)", () => {
		const summary = summarizeTrip(
			[
				row({ id: "a", amount: -9000 }),
				row({
					id: "b",
					amount: -212.3,
					categoryName: "Transporte",
					cardName: null,
					accountName: "Itaú",
				}),
				row({
					id: "c",
					amount: 800,
					transactionType: "Receita",
					categoryName: "Reembolso",
				}),
			],
			ADMIN,
		);

		expect(summary.expenses).toBe(9212.3);
		expect(summary.reimbursements).toBe(800);
		expect(summary.netCost).toBe(8412.3);
		expect(summary.byCategory).toEqual([
			{ label: "Restaurantes", amount: 9000 },
			{ label: "Transporte", amount: 212.3 },
		]);
		expect(summary.bySource).toEqual([
			{ label: "C6", amount: 9000 },
			{ label: "Itaú", amount: 212.3 },
		]);
	});

	it("parte de outra pessoa fica fora do total e aparece na quebra por pessoa", () => {
		const summary = summarizeTrip(
			[
				row({ id: "j1", amount: -150, splitGroupId: "g" }),
				row({
					id: "j2",
					amount: -150,
					splitGroupId: "g",
					payerId: ANA,
					payerName: "Ana",
				}),
			],
			ADMIN,
		);

		expect(summary.netCost).toBe(150);
		expect(summary.byPayer).toEqual([
			{ label: "Ana", amount: 150 },
			{ label: "Eu", amount: 150 },
		]);
	});

	it("soma em centavos sem erro de ponto flutuante", () => {
		const summary = summarizeTrip(
			[row({ id: "1", amount: -0.1 }), row({ id: "2", amount: -0.2 })],
			ADMIN,
		);
		expect(summary.netCost).toBe(0.3);
	});

	it("sem pessoa admin, total zero e nada quebra", () => {
		const summary = summarizeTrip([row({ amount: -50 })], null);
		expect(summary).toMatchObject({
			netCost: 0,
			expenses: 0,
			reimbursements: 0,
			byCategory: [],
		});
		expect(summary.byPayer).toEqual([{ label: "Eu", amount: 50 }]);
	});

	it("rótulos ausentes viram texto padrão", () => {
		const summary = summarizeTrip(
			[
				row({
					categoryName: null,
					cardName: null,
					accountName: null,
					payerName: null,
				}),
			],
			ADMIN,
		);
		expect(summary.byCategory[0]?.label).toBe("Sem categoria");
		expect(summary.bySource[0]?.label).toBe("Sem cartão ou conta");
		expect(summary.byPayer[0]?.label).toBe("Sem pessoa");
	});
});
