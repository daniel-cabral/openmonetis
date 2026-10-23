import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const insertWrites: unknown[][] = [];
	const updateWrites: unknown[] = [];
	const selectQueue: unknown[][] = [];
	const dbMock = {
		query: { transactions: { findFirst: vi.fn() } },
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(selectQueue.shift() ?? []),
			}),
		}),
		insert: () => ({
			values: (values: unknown[]) => {
				insertWrites.push(values);
				return {
					returning: () =>
						Promise.resolve(values.map((_, index) => ({ id: `new-${index}` }))),
				};
			},
		}),
		update: () => ({
			set: (values: unknown) => {
				updateWrites.push(values);
				return { where: () => Promise.resolve(undefined) };
			},
		}),
		transaction: async (callback: (tx: unknown) => unknown): Promise<unknown> =>
			callback(dbMock),
	};
	return {
		insertWrites,
		updateWrites,
		selectQueue,
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
vi.mock("../lib/attachment-copy", () => ({
	copyAttachmentsForImport: vi.fn(),
}));
vi.mock("@/shared/lib/trips/queries", () => ({
	validateTripOwnership: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/shared/lib/trips/link", () => ({
	setTripForTransactions: vi.fn(),
}));
vi.mock("./core", async (importOriginal) => ({
	...(await importOriginal<typeof import("./core")>()),
	validateAllOwnership: vi.fn().mockResolvedValue(null),
	validateCardLimit: vi.fn().mockResolvedValue({ ok: true }),
	getPaidInvoicePeriods: vi.fn().mockResolvedValue([]),
}));

import { updateTransactionBulkAction } from "./bulk-actions";
import {
	createTransactionAction,
	updateTransactionAction,
} from "./single-actions";

const USER_ID = "user-1";
const TX_ID = "33333333-3333-4333-8333-333333333333";
const PAYER_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const MORADIA = "99999999-9999-4999-8999-999999999999";
const TRANSPORTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FAXINA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IPTU = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const fields = {
	purchaseDate: "2026-05-14",
	name: "Uber",
	transactionType: "Despesa" as const,
	amount: 42.5,
	condition: "À vista" as const,
	paymentMethod: "Pix" as const,
	payerId: PAYER_ID,
	accountId: ACCOUNT_ID,
	categoryId: MORADIA,
	isSettled: true,
	isSplit: false,
	note: null,
};

const existing = {
	id: TX_ID,
	name: "Uber",
	note: null,
	period: "2026-05",
	purchaseDate: new Date(2026, 4, 14),
	transactionType: "Despesa",
	condition: "À vista",
	paymentMethod: "Pix",
	payerId: PAYER_ID,
	accountId: ACCOUNT_ID,
	cardId: null,
	categoryId: MORADIA,
	subcategoryId: null as string | null,
	seriesId: null as string | null,
	splitGroupId: null as string | null,
	tripId: null as string | null,
};

beforeEach(() => {
	mocks.insertWrites.length = 0;
	mocks.updateWrites.length = 0;
	mocks.selectQueue.length = 0;
	vi.clearAllMocks();
	mocks.getUserMock.mockResolvedValue({
		id: USER_ID,
		name: "Eu",
		email: "eu@x",
	});
	mocks.dbMock.query.transactions.findFirst.mockResolvedValue(existing);
});

describe("createTransactionAction", () => {
	it("grava a subcategoria da categoria escolhida", async () => {
		mocks.selectQueue.push([{ id: FAXINA, categoryId: MORADIA }]);
		const result = await createTransactionAction({
			...fields,
			name: "Faxina Maria",
			amount: 120,
			subcategoryId: FAXINA,
		});
		expect(result.success).toBe(true);
		expect(mocks.insertWrites[0]).toEqual([
			expect.objectContaining({
				categoryId: MORADIA,
				subcategoryId: FAXINA,
				amount: "-120.00",
			}),
		]);
	});
});

describe("updateTransactionAction", () => {
	it("rejeita subcategoria de outra categoria sem gravar nada", async () => {
		mocks.selectQueue.push([{ id: FAXINA, categoryId: MORADIA }]);
		const result = await updateTransactionAction({
			id: TX_ID,
			...fields,
			categoryId: TRANSPORTE,
			subcategoryId: FAXINA,
		});
		expect(result).toEqual({
			success: false,
			error: "A subcategoria não pertence à categoria escolhida.",
		});
		expect(mocks.updateWrites).toHaveLength(0);
	});

	it("trocar a categoria sem enviar subcategoria limpa a gravada", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({
			...existing,
			subcategoryId: FAXINA,
		});
		await updateTransactionAction({
			id: TX_ID,
			...fields,
			categoryId: TRANSPORTE,
		});
		expect(mocks.updateWrites[0]).toEqual(
			expect.objectContaining({
				categoryId: TRANSPORTE,
				subcategoryId: null,
			}),
		);
	});
});

describe("updateTransactionBulkAction", () => {
	it("edicao em serie grava a subcategoria", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({
			...existing,
			condition: "Parcelado",
			seriesId: "serie-iptu",
			categoryId: MORADIA,
			subcategoryId: null,
		});
		mocks.selectQueue.push([{ id: IPTU, categoryId: MORADIA }]);
		const result = await updateTransactionBulkAction({
			id: TX_ID,
			scope: "current",
			name: "IPTU",
			note: null,
			categoryId: MORADIA,
			subcategoryId: IPTU,
		});
		expect(result.success).toBe(true);
		expect(mocks.updateWrites[0]).toEqual(
			expect.objectContaining({ subcategoryId: IPTU }),
		);
	});
});
