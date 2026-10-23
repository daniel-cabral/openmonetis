import { describe, expect, it } from "vitest";
import type { TransactionItem } from "../components/types";
import {
	applyFieldDependencies,
	buildTransactionInitialState,
} from "./form-helpers";

const MORADIA_ID = "55555555-5555-4555-8555-555555555555";
const TRANSPORTE_ID = "66666666-6666-4666-8666-666666666666";
const FAXINA_ID = "77777777-7777-4777-8777-777777777777";

const transaction: TransactionItem = {
	id: "t1",
	userId: "user-1",
	name: "Faxina",
	purchaseDate: "2026-05-14",
	period: "2026-05",
	transactionType: "Despesa",
	amount: -120,
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
	categoryId: MORADIA_ID,
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
	subcategoryId: FAXINA_ID,
};

describe("subcategoryId no formulário", () => {
	it("edição abre com a subcategoria gravada", () => {
		expect(buildTransactionInitialState(transaction).subcategoryId).toBe(
			FAXINA_ID,
		);
	});

	it("trocar a categoria limpa a subcategoria escolhida", () => {
		const state = buildTransactionInitialState(transaction);

		const changed = applyFieldDependencies("categoryId", TRANSPORTE_ID, state);
		expect(changed).toHaveProperty("subcategoryId");
		expect(changed.subcategoryId).toBeUndefined();

		expect(
			applyFieldDependencies("categoryId", MORADIA_ID, state),
		).not.toHaveProperty("subcategoryId");
	});
});
