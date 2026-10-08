import { describe, expect, it } from "vitest";
import {
	buildSourceOptions,
	filterBySource,
	paginate,
	SUGGESTIONS_PAGE_SIZE,
	type SuggestionSourceRow,
} from "./suggestion-view";

const row = (
	id: string,
	source: {
		cardId?: string;
		cardName?: string;
		accountId?: string;
		accountName?: string;
	},
): SuggestionSourceRow => ({
	id,
	cardId: source.cardId ?? null,
	cardName: source.cardName ?? null,
	accountId: source.accountId ?? null,
	accountName: source.accountName ?? null,
});

const rows = [
	row("1", { cardId: "c6", cardName: "C6 Black" }),
	row("2", { accountId: "a1", accountName: "Conta C6" }),
	row("3", { cardId: "nu", cardName: "Nubank" }),
	row("4", { cardId: "c6", cardName: "C6 Black" }),
	row("5", {}),
];

describe("filterBySource", () => {
	it.each([
		["all", ["1", "2", "3", "4", "5"]],
		["cards", ["1", "3", "4"]],
		["accounts", ["2"]],
		["card:c6", ["1", "4"]],
		["account:a1", ["2"]],
		["card:unknown", []],
	])("%s", (source, expected) => {
		expect(filterBySource(rows, source).map((r) => r.id)).toEqual(expected);
	});
});

describe("buildSourceOptions", () => {
	it("lists the fixed options, then each card and account once, sorted by name", () => {
		expect(buildSourceOptions(rows)).toEqual([
			{ value: "all", label: "Todos" },
			{ value: "cards", label: "Só cartões" },
			{ value: "accounts", label: "Só contas" },
			{ value: "card:c6", label: "C6 Black" },
			{ value: "account:a1", label: "Conta C6" },
			{ value: "card:nu", label: "Nubank" },
		]);
	});
});

describe("paginate", () => {
	const many = Array.from({ length: 57 }, (_, i) => i + 1);

	it("slices pages of the default size and reports totals", () => {
		expect(SUGGESTIONS_PAGE_SIZE).toBe(20);
		const first = paginate(many, 1);
		expect(first.items).toHaveLength(20);
		expect(first).toMatchObject({
			page: 1,
			pageCount: 3,
			from: 1,
			to: 20,
			total: 57,
		});
		const last = paginate(many, 3);
		expect(last.items).toEqual(many.slice(40));
		expect(last).toMatchObject({ page: 3, from: 41, to: 57 });
	});

	it("clamps out-of-range pages", () => {
		expect(paginate(many, 9).page).toBe(3);
		expect(paginate(many, 0).page).toBe(1);
	});

	it("handles an empty list", () => {
		expect(paginate([], 1)).toEqual({
			items: [],
			page: 1,
			pageCount: 1,
			from: 0,
			to: 0,
			total: 0,
		});
	});
});
