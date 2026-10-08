import { describe, expect, it } from "vitest";
import type { TransactionItem } from "../components/types";
import { buildTransactionInitialState } from "./form-helpers";
import { mapTransactionsData } from "./page-helpers";

const TRIP_ID = "44444444-4444-4444-8444-444444444444";

const transaction: TransactionItem = {
	id: "t1",
	userId: "user-1",
	name: "Uber",
	purchaseDate: "2026-05-14",
	period: "2026-05",
	transactionType: "Despesa",
	amount: -42.5,
	condition: "À vista",
	paymentMethod: "Pix",
	payerId: null,
	pagadorName: null,
	pagadorAvatar: null,
	pagadorRole: null,
	accountId: null,
	contaName: null,
	contaLogo: null,
	cardId: null,
	cartaoName: null,
	cartaoLogo: null,
	categoryId: null,
	categoriaName: null,
	categoriaType: null,
	categoriaIcon: null,
	installmentCount: null,
	recurrenceCount: null,
	currentInstallment: null,
	dueDate: null,
	boletoPaymentDate: null,
	note: null,
	isSettled: true,
	isDivided: false,
	isAnticipated: false,
	anticipationId: null,
	seriesId: null,
	splitGroupId: null,
	hasAttachments: false,
	tripId: TRIP_ID,
};

describe("tripId no formulário", () => {
	it("edição mostra a viagem gravada", () => {
		expect(buildTransactionInitialState(transaction).tripId).toBe(TRIP_ID);
	});

	it("criação começa sem viagem", () => {
		expect(buildTransactionInitialState(undefined).tripId).toBeUndefined();
	});

	it("importação de outro lançamento não copia a viagem", () => {
		expect(
			buildTransactionInitialState(transaction, null, undefined, {
				isImporting: true,
			}).tripId,
		).toBeUndefined();
	});
});

describe("mapTransactionsData", () => {
	it("leva tripId da linha do banco", () => {
		const [mapped] = mapTransactionsData([{ id: "t1", tripId: TRIP_ID }]);
		expect(mapped?.tripId).toBe(TRIP_ID);
		const [withoutTrip] = mapTransactionsData([{ id: "t2" }]);
		expect(withoutTrip?.tripId).toBeNull();
	});
});
