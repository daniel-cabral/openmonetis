import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/lib/actions/helpers", () => ({
	revalidateForEntity: vi.fn(),
}));

import {
	buildTransactionRecords,
	updateBulkSchema,
	updateSchema,
} from "./core";

const TRIP_ID = "44444444-4444-4444-8444-444444444444";
const PAYER_A = "11111111-1111-4111-8111-111111111111";
const PAYER_B = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_ID = "55555555-5555-4555-8555-555555555555";
const LANCAMENTO_ID = "66666666-6666-4666-8666-666666666666";

type Params = Parameters<typeof buildTransactionRecords>[0];

const params = (
	data: Record<string, unknown>,
	shares: Params["shares"],
): Params => ({
	data: {
		purchaseDate: "2026-03-02",
		name: "TAP",
		transactionType: "Despesa",
		amount: 1000,
		condition: "Parcelado",
		paymentMethod: "Pix",
		installmentCount: 10,
		startInstallment: 1,
		isSplit: shares.length > 1,
		tripId: TRIP_ID,
		...data,
	} as Params["data"],
	userId: "user-1",
	period: "2026-03",
	purchaseDate: new Date(2026, 2, 2),
	dueDate: null,
	boletoPaymentDate: null,
	shares,
	amountSign: -1,
	shouldNullifySettled: false,
	seriesId: "serie-tap",
});

describe("tripId nos registros", () => {
	it("as 10 parcelas divididas entre duas pessoas herdam a viagem", () => {
		const records = buildTransactionRecords(
			params({}, [
				{ payerId: PAYER_A, amountCents: 50000 },
				{ payerId: PAYER_B, amountCents: 50000 },
			]),
		);
		expect(records).toHaveLength(20);
		expect(new Set(records.map((record) => record.tripId))).toEqual(
			new Set([TRIP_ID]),
		);
	});

	it("recorrente criado com viagem vincula só a primeira ocorrência", () => {
		const records = buildTransactionRecords(
			params(
				{
					condition: "Recorrente",
					recurrenceCount: 12,
					installmentCount: undefined,
				},
				[{ payerId: PAYER_A, amountCents: 5590 }],
			),
		);
		expect(records).toHaveLength(12);
		expect(records[0]?.tripId).toBe(TRIP_ID);
		expect(records.slice(1).every((record) => record.tripId === null)).toBe(
			true,
		);
	});

	it("transferência nunca grava viagem", () => {
		const records = buildTransactionRecords(
			params({ transactionType: "Transferência", condition: "À vista" }, [
				{ payerId: PAYER_A, amountCents: 100000 },
			]),
		);
		expect(records.every((record) => record.tripId === null)).toBe(true);
	});

	it("sem viagem grava null", () => {
		const records = buildTransactionRecords(
			params({ tripId: undefined, condition: "À vista" }, [
				{ payerId: PAYER_A, amountCents: 100000 },
			]),
		);
		expect(records[0]?.tripId).toBeNull();
	});
});

describe("schemas", () => {
	const validUpdate = {
		id: LANCAMENTO_ID,
		purchaseDate: "2026-03-02",
		name: "TAP",
		transactionType: "Despesa",
		amount: 10,
		condition: "À vista",
		paymentMethod: "Pix",
		categoryId: CATEGORY_ID,
		accountId: ACCOUNT_ID,
	};

	it("aceitam uuid, null e ausência; rejeitam lixo", () => {
		expect(
			updateSchema.safeParse({ ...validUpdate, tripId: TRIP_ID }).success,
		).toBe(true);
		expect(
			updateSchema.safeParse({ ...validUpdate, tripId: null }).success,
		).toBe(true);
		expect(updateSchema.safeParse(validUpdate).success).toBe(true);
		const rejected = updateSchema.safeParse({ ...validUpdate, tripId: "abc" });
		expect(rejected.success).toBe(false);
		expect(rejected.error?.issues.map((issue) => issue.message)).toContain(
			"Viagem inválida.",
		);

		const bulk = updateBulkSchema.parse({
			id: PAYER_A,
			scope: "all",
			name: "TAP",
			tripId: TRIP_ID,
		});
		expect(bulk.tripId).toBe(TRIP_ID);
		expect(
			updateBulkSchema.safeParse({
				id: PAYER_A,
				scope: "all",
				name: "TAP",
				tripId: "abc",
			}).success,
		).toBe(false);
	});
});
