import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const updateWrites: unknown[] = [];
	const dbMock = {
		query: { transactions: { findFirst: vi.fn() } },
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
		updateWrites,
		dbMock,
		getUserMock: vi.fn(),
		validateTripOwnershipMock: vi.fn(),
		setTripMock: vi.fn(),
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
	validateTripOwnership: mocks.validateTripOwnershipMock,
}));
vi.mock("@/shared/lib/trips/link", () => ({
	setTripForTransactions: mocks.setTripMock,
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
	updateTransactionSplitPairAction,
} from "./single-actions";

const USER_ID = "user-1";
const TX_ID = "33333333-3333-4333-8333-333333333333";
const TRIP_ID = "44444444-4444-4444-8444-444444444444";
const PAYER_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "55555555-5555-4555-8555-555555555555";

const fields = {
	purchaseDate: "2026-05-14",
	name: "Uber",
	transactionType: "Despesa" as const,
	amount: 42.5,
	condition: "À vista" as const,
	paymentMethod: "Pix" as const,
	payerId: PAYER_ID,
	accountId: ACCOUNT_ID,
	categoryId: CATEGORY_ID,
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
	categoryId: null,
	seriesId: null as string | null,
	splitGroupId: null as string | null,
	tripId: null as string | null,
};

beforeEach(() => {
	mocks.updateWrites.length = 0;
	vi.clearAllMocks();
	mocks.getUserMock.mockResolvedValue({
		id: USER_ID,
		name: "Eu",
		email: "eu@x",
	});
	mocks.validateTripOwnershipMock.mockResolvedValue(null);
	mocks.setTripMock.mockResolvedValue(1);
	mocks.dbMock.query.transactions.findFirst.mockResolvedValue(existing);
});

describe("updateTransactionAction", () => {
	it("propaga a viagem escolhida", async () => {
		const result = await updateTransactionAction({
			id: TX_ID,
			...fields,
			tripId: TRIP_ID,
		});
		expect(result.success).toBe(true);
		expect(mocks.validateTripOwnershipMock).toHaveBeenCalledWith(
			USER_ID,
			TRIP_ID,
		);
		expect(mocks.setTripMock).toHaveBeenCalledWith(
			mocks.dbMock,
			USER_ID,
			[TX_ID],
			TRIP_ID,
		);
	});

	it("limpar o campo desvincula esta linha", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({
			...existing,
			tripId: TRIP_ID,
		});
		await updateTransactionAction({ id: TX_ID, ...fields, tripId: null });
		expect(mocks.setTripMock).toHaveBeenCalledWith(
			mocks.dbMock,
			USER_ID,
			[TX_ID],
			null,
		);
	});

	it("salvar com a mesma viagem gravada não repropaga", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({
			...existing,
			tripId: TRIP_ID,
		});
		await updateTransactionAction({ id: TX_ID, ...fields, tripId: TRIP_ID });
		expect(mocks.setTripMock).not.toHaveBeenCalled();
	});

	it("sem tripId no payload não mexe no vínculo", async () => {
		await updateTransactionAction({ id: TX_ID, ...fields });
		expect(mocks.setTripMock).not.toHaveBeenCalled();
	});

	it("viagem de outro usuário não grava nada", async () => {
		mocks.validateTripOwnershipMock.mockResolvedValue("Viagem não encontrada.");
		const result = await updateTransactionAction({
			id: TX_ID,
			...fields,
			tripId: TRIP_ID,
		});
		expect(result).toEqual({ success: false, error: "Viagem não encontrada." });
		expect(mocks.updateWrites).toHaveLength(0);
		expect(mocks.setTripMock).not.toHaveBeenCalled();
	});
});

describe("updateTransactionSplitPairAction", () => {
	it("propaga para o grupo de divisão", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({
			...existing,
			splitGroupId: "grupo-jantar",
		});
		await updateTransactionSplitPairAction({
			id: TX_ID,
			...fields,
			tripId: TRIP_ID,
		});
		expect(mocks.setTripMock).toHaveBeenCalledWith(
			mocks.dbMock,
			USER_ID,
			[TX_ID],
			TRIP_ID,
		);
	});
});

describe("updateTransactionBulkAction", () => {
	it("escopo 'só esta' ainda vincula (o helper expande as parcelas)", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({
			...existing,
			condition: "Parcelado",
			seriesId: "serie-tap",
		});
		const result = await updateTransactionBulkAction({
			id: TX_ID,
			scope: "current",
			name: "TAP",
			note: null,
			tripId: TRIP_ID,
		});
		expect(result.success).toBe(true);
		expect(mocks.setTripMock).toHaveBeenCalledWith(
			mocks.dbMock,
			USER_ID,
			[TX_ID],
			TRIP_ID,
		);
	});

	it("viagem de outro usuário é rejeitada", async () => {
		mocks.dbMock.query.transactions.findFirst.mockResolvedValue({
			...existing,
			seriesId: "serie-tap",
		});
		mocks.validateTripOwnershipMock.mockResolvedValue("Viagem não encontrada.");
		const result = await updateTransactionBulkAction({
			id: TX_ID,
			scope: "all",
			name: "TAP",
			note: null,
			tripId: TRIP_ID,
		});
		expect(result).toEqual({ success: false, error: "Viagem não encontrada." });
		expect(mocks.updateWrites).toHaveLength(0);
	});
});

describe("createTransactionAction", () => {
	it("viagem de outro usuário é rejeitada antes de inserir", async () => {
		mocks.validateTripOwnershipMock.mockResolvedValue("Viagem não encontrada.");
		const result = await createTransactionAction({
			...fields,
			tripId: TRIP_ID,
		});
		expect(result).toEqual({ success: false, error: "Viagem não encontrada." });
	});
});
