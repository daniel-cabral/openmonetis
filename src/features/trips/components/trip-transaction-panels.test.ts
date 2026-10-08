import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TripTransactionRow } from "@/features/trips/lib/summary";
import { formatCurrency } from "@/shared/utils/currency";
import { TripSuggestions } from "./trip-suggestions";
import { TripTransactionsList } from "./trip-transactions-list";

vi.mock("@/features/trips/actions", () => ({
	linkTransactionsToTripAction: vi.fn(),
	unlinkTransactionsFromTripAction: vi.fn(),
}));

const TRIP_ID = "7f1b8c2e-3d4a-4b5c-8d6e-9f0a1b2c3d4e";

const row = (overrides: Partial<TripTransactionRow>): TripTransactionRow => ({
	id: "row",
	name: "Hotel",
	purchaseDate: "2026-05-14",
	amount: -500,
	transactionType: "Despesa",
	payerId: "admin",
	payerName: "Ana",
	categoryName: "Hospedagem",
	cardId: "c6",
	cardName: "C6",
	accountId: null,
	accountName: null,
	condition: "À vista",
	currentInstallment: null,
	installmentCount: null,
	seriesId: null,
	splitGroupId: null,
	...overrides,
});

// SSR puts <!-- --> between adjacent text nodes; strip it so labels read as shown.
const render = (element: ReactElement) =>
	renderToStaticMarkup(element).replace(/<!-- -->/g, "");

describe("painel de lancamentos da viagem", () => {
	it("lista vinculados com parcela, valor e Desvincular por linha", () => {
		const html = render(
			createElement(TripTransactionsList, {
				rows: [
					row({
						id: "a",
						name: "Hotel",
						currentInstallment: 2,
						installmentCount: 3,
					}),
				],
			}),
		);

		expect(html).toContain("Hotel (2/3)");
		expect(html).toContain(formatCurrency(-500));
		expect(html).toContain("Desvincular");
	});

	it("mostra estado vazio em vinculados e sugestoes", () => {
		expect(render(createElement(TripTransactionsList, { rows: [] }))).toContain(
			"Nenhum lançamento vinculado",
		);
		expect(
			render(createElement(TripSuggestions, { tripId: TRIP_ID, rows: [] })),
		).toContain("Nenhuma sugestão.");
	});

	it("sugestoes em tabela: origem, categoria, checkbox por linha e no cabecalho", () => {
		const html = render(
			createElement(TripSuggestions, {
				tripId: TRIP_ID,
				rows: [
					row({ id: "a", name: "Mercado", cardId: "nu", cardName: "Nubank" }),
					row({
						id: "b",
						name: "Netflix",
						condition: "Recorrente",
						categoryName: "Assinaturas",
					}),
					row({
						id: "c",
						name: "Saque",
						cardId: null,
						cardName: null,
						accountId: "a1",
						accountName: "Conta C6",
					}),
				],
			}),
		);

		expect(html.match(/role="checkbox"/g)).toHaveLength(4);
		expect(html).toContain('id="suggestion-a"');
		expect(html).toContain("Nubank");
		expect(html).toContain("Conta C6");
		expect(html).toContain("Assinaturas");
		expect(html).toContain("recorrente");
		expect(html).toContain("Sugestões (3)");
		expect(html).toContain("Origem");

		const label = html.indexOf("Vincular selecionados");
		const buttonStart = html.lastIndexOf("<button", label);
		expect(html.slice(buttonStart, label)).toContain('disabled=""');
	});

	it("sugestoes paginam de 20 em 20", () => {
		const rows = Array.from({ length: 25 }, (_, i) =>
			row({ id: `r${i + 1}`, name: `Compra ${i + 1}` }),
		);
		const html = render(
			createElement(TripSuggestions, { tripId: TRIP_ID, rows }),
		);

		expect(html).toContain("Compra 20<");
		expect(html).not.toContain("Compra 21<");
		expect(html).toContain("1 a 20 de 25");
		expect(html).toContain("Próxima");
	});
});
