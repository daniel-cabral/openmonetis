import { describe, expect, it } from "vitest";
import type { ImportedTransaction } from "./types";

describe("ImportedTransaction - campos aditivos para conciliação", () => {
	it("aceita os novos campos opcionais sem quebrar os campos existentes", () => {
		const tx: ImportedTransaction = {
			externalId: null,
			externalIdOccurrence: 0,
			date: "2026-08-01",
			amount: -86.59,
			description: "LOJA SPACE BC",
			sourceDescription: "LOJA SPACE BC",
			transactionType: "expense",
			postedDate: "2026-08-02",
			dayBalance: 1234.56,
			installment: { number: 1, total: 3 },
			cardLast4: "1234",
			holderName: "TITULAR TESTE",
			fx: { currency: "USD", amount: 10 },
			isPurchase: true,
			lineKind: "purchase",
		};

		expect(tx.postedDate).toBe("2026-08-02");
		expect(tx.dayBalance).toBe(1234.56);
		expect(tx.installment).toEqual({ number: 1, total: 3 });
		expect(tx.cardLast4).toBe("1234");
		expect(tx.holderName).toBe("TITULAR TESTE");
		expect(tx.fx).toEqual({ currency: "USD", amount: 10 });
		expect(tx.isPurchase).toBe(true);
		expect(tx.lineKind).toBe("purchase");
	});

	it("aceita lineKind 'credit' e 'invoice-payment', além de 'purchase'", () => {
		const credit: ImportedTransaction = {
			externalId: null,
			externalIdOccurrence: 0,
			date: "2026-08-01",
			amount: 50,
			description: "ESTORNO",
			sourceDescription: "ESTORNO",
			transactionType: "income",
			lineKind: "credit",
		};
		const invoicePayment: ImportedTransaction = {
			externalId: null,
			externalIdOccurrence: 0,
			date: "2026-08-01",
			amount: 500,
			description: "PAG FATURA",
			sourceDescription: "PAG FATURA",
			transactionType: "income",
			lineKind: "invoice-payment",
		};

		expect(credit.lineKind).toBe("credit");
		expect(invoicePayment.lineKind).toBe("invoice-payment");
	});

	it("continua aceitando um objeto só com os campos existentes (todos os novos são opcionais)", () => {
		const tx: ImportedTransaction = {
			externalId: "FIT1",
			externalIdOccurrence: 1,
			date: "2026-08-01",
			amount: 100,
			description: "PIX",
			sourceDescription: "PIX",
			transactionType: "income",
		};

		expect(tx.postedDate).toBeUndefined();
	});
});
