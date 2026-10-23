import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const updateWrites: unknown[] = [];
	const selectQueue: unknown[][] = [];
	const findManyMock = vi.fn();
	const dbMock = {
		query: { transactions: { findMany: findManyMock } },
		select: () => ({
			from: () => ({
				innerJoin: () => ({
					where: () => Promise.resolve(selectQueue.shift() ?? []),
				}),
			}),
		}),
		update: () => ({
			set: (values: unknown) => {
				updateWrites.push(values);
				return { where: () => Promise.resolve(undefined) };
			},
		}),
	};
	return {
		updateWrites,
		selectQueue,
		findManyMock,
		dbMock,
		getUserMock: vi.fn(),
	};
});

vi.mock("@/shared/lib/auth/server", () => ({ getUser: mocks.getUserMock }));
vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/actions/helpers", () => ({
	revalidateForEntity: vi.fn(),
	handleActionError: (error: unknown) => ({
		success: false,
		error: error instanceof Error ? error.message : "erro",
	}),
}));
vi.mock("@/shared/lib/payers/notifications", () => ({
	buildEntriesByPayer: vi.fn(() => []),
	sendPayerAutoEmails: vi.fn(),
}));
vi.mock("./attachments", () => ({
	cleanupAttachmentsAfterTransactionDelete: vi.fn(),
}));

import {
	INITIAL_BALANCE_CONDITION,
	INITIAL_BALANCE_NOTE,
	INITIAL_BALANCE_PAYMENT_METHOD,
	INITIAL_BALANCE_TRANSACTION_TYPE,
} from "@/shared/lib/accounts/constants";
import { setTransactionsSubcategoryAction } from "./bulk-actions";

const USER_ID = "user-1";
const MORADIA = "99999999-9999-4999-8999-999999999999";
const TRANSPORTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FAXINA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TX_1 = "10000000-0000-4000-8000-000000000001";
const TX_2 = "10000000-0000-4000-8000-000000000002";
const TX_3 = "10000000-0000-4000-8000-000000000003";
const TX_4 = "10000000-0000-4000-8000-000000000004";
const TX_5 = "10000000-0000-4000-8000-000000000005";

const moradiaRow = {
	categoryId: MORADIA,
	note: null,
	transactionType: "Despesa",
	condition: "À vista",
	paymentMethod: "Pix",
};

beforeEach(() => {
	mocks.updateWrites.length = 0;
	mocks.selectQueue.length = 0;
	vi.clearAllMocks();
	mocks.getUserMock.mockResolvedValue({
		id: USER_ID,
		name: "Eu",
		email: "eu@x",
	});
});

describe("setTransactionsSubcategoryAction", () => {
	it("4 de Moradia e 1 de Transporte: atualiza 4 e ignora 1", async () => {
		mocks.findManyMock.mockResolvedValue([
			{ id: TX_1, ...moradiaRow },
			{ id: TX_2, ...moradiaRow },
			{ id: TX_3, ...moradiaRow },
			{ id: TX_4, ...moradiaRow },
			{ id: TX_5, ...moradiaRow, categoryId: TRANSPORTE },
		]);
		mocks.selectQueue.push([
			{ id: FAXINA, name: "Faxina", categoryId: MORADIA, categoryName: "Moradia" },
		]);

		const result = await setTransactionsSubcategoryAction({
			ids: [TX_1, TX_2, TX_3, TX_4, TX_5],
			subcategoryId: FAXINA,
		});

		expect(result).toEqual({
			success: true,
			message:
				"4 lançamentos atualizados para Faxina. 1 ignorado: não é da categoria Moradia.",
			data: { updated: 4, skipped: 1 },
		});
		expect(mocks.updateWrites).toEqual([{ subcategoryId: FAXINA }]);
	});

	it("lancamento protegido na selecao recusa o lote inteiro", async () => {
		mocks.findManyMock.mockResolvedValue([
			{ id: TX_1, ...moradiaRow },
			{
				id: TX_2,
				...moradiaRow,
				note: INITIAL_BALANCE_NOTE,
				transactionType: INITIAL_BALANCE_TRANSACTION_TYPE,
				condition: INITIAL_BALANCE_CONDITION,
				paymentMethod: INITIAL_BALANCE_PAYMENT_METHOD,
			},
		]);
		mocks.selectQueue.push([
			{ id: FAXINA, name: "Faxina", categoryId: MORADIA, categoryName: "Moradia" },
		]);

		const result = await setTransactionsSubcategoryAction({
			ids: [TX_1, TX_2],
			subcategoryId: FAXINA,
		});

		expect(result).toEqual({
			success: false,
			error: "Lançamentos protegidos não podem ser atualizados em massa.",
		});
		expect(mocks.updateWrites).toHaveLength(0);
	});

	it("subcategoryId null limpa a subcategoria dos lancamentos selecionados", async () => {
		mocks.findManyMock.mockResolvedValue([
			{ id: TX_1, ...moradiaRow },
			{ id: TX_2, ...moradiaRow },
		]);

		const result = await setTransactionsSubcategoryAction({
			ids: [TX_1, TX_2],
			subcategoryId: null,
		});

		expect(result).toEqual({
			success: true,
			message: "2 lançamentos ficaram sem subcategoria.",
			data: { updated: 2, skipped: 0 },
		});
		expect(mocks.updateWrites).toEqual([{ subcategoryId: null }]);
	});

	it.each([
		[
			"subcategoria desconhecida ou de outro usuario",
			[],
			"Subcategoria não encontrada.",
		],
		[
			"nenhum lancamento da categoria da subcategoria",
			[
				{
					id: FAXINA,
					name: "Faxina",
					categoryId: TRANSPORTE,
					categoryName: "Transporte",
				},
			],
			"Nenhum lançamento selecionado é da categoria Transporte.",
		],
	])("%s: recusa sem gravar", async (_, subcategoryRows, error) => {
		mocks.findManyMock.mockResolvedValue([{ id: TX_1, ...moradiaRow }]);
		mocks.selectQueue.push(subcategoryRows);

		const result = await setTransactionsSubcategoryAction({
			ids: [TX_1],
			subcategoryId: FAXINA,
		});

		expect(result).toEqual({ success: false, error });
		expect(mocks.updateWrites).toHaveLength(0);
	});
});
