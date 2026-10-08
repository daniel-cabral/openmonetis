import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	dbMock: { marker: "db" },
	getUserMock: vi.fn(),
	validateTripOwnershipMock: vi.fn(),
	setTripMock: vi.fn(),
	revalidateMock: vi.fn(),
}));

vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/auth/server", () => ({ getUser: mocks.getUserMock }));
vi.mock("@/shared/lib/trips/queries", () => ({
	fetchUserTrips: vi.fn(),
	validateTripOwnership: mocks.validateTripOwnershipMock,
}));
vi.mock("@/shared/lib/trips/link", () => ({
	setTripForTransactions: mocks.setTripMock,
}));
vi.mock("@/shared/lib/actions/helpers", () => ({
	revalidateForEntity: mocks.revalidateMock,
	handleActionError: (error: unknown) => ({
		success: false,
		error:
			error && typeof error === "object" && "issues" in error
				? (error as { issues: { message: string }[] }).issues[0]?.message
				: "Ocorreu um erro inesperado. Tente novamente.",
	}),
}));

import {
	linkTransactionsToTripAction,
	unlinkTransactionsFromTripAction,
} from "./actions";

const USER_ID = "user-1";
const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const UBER = "22222222-2222-4222-8222-222222222222";
const PINGO_DOCE = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getUserMock.mockResolvedValue({ id: USER_ID });
	mocks.validateTripOwnershipMock.mockResolvedValue(null);
	mocks.setTripMock.mockResolvedValue(2);
});

describe("linkTransactionsToTripAction", () => {
	it("vincula Uber e Pingo Doce em lote", async () => {
		const result = await linkTransactionsToTripAction({
			tripId: TRIP_ID,
			transactionIds: [UBER, PINGO_DOCE],
		});

		expect(result).toMatchObject({ success: true, data: { count: 2 } });
		expect(mocks.validateTripOwnershipMock).toHaveBeenCalledWith(
			USER_ID,
			TRIP_ID,
		);
		expect(mocks.setTripMock).toHaveBeenCalledWith(
			mocks.dbMock,
			USER_ID,
			[UBER, PINGO_DOCE],
			TRIP_ID,
		);
		expect(mocks.revalidateMock).toHaveBeenCalledWith("trips", USER_ID);
	});

	it("viagem de outro usuário não vincula nada", async () => {
		mocks.validateTripOwnershipMock.mockResolvedValue("Viagem não encontrada.");
		const result = await linkTransactionsToTripAction({
			tripId: TRIP_ID,
			transactionIds: [UBER],
		});
		expect(result).toEqual({ success: false, error: "Viagem não encontrada." });
		expect(mocks.setTripMock).not.toHaveBeenCalled();
	});

	it("seleção vazia é rejeitada", async () => {
		const result = await linkTransactionsToTripAction({
			tripId: TRIP_ID,
			transactionIds: [],
		});
		expect(result).toEqual({
			success: false,
			error: "Selecione ao menos um lançamento.",
		});
	});
});

describe("unlinkTransactionsFromTripAction", () => {
	it("grava viagem nula (o helper solta só as linhas recebidas)", async () => {
		mocks.setTripMock.mockResolvedValue(1);
		const result = await unlinkTransactionsFromTripAction({
			transactionIds: [UBER],
		});
		expect(result.success).toBe(true);
		expect(mocks.setTripMock).toHaveBeenCalledWith(
			mocks.dbMock,
			USER_ID,
			[UBER],
			null,
		);
	});
});
