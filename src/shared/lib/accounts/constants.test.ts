import { describe, expect, it } from "vitest";
import {
	ACCOUNT_AUTO_INVOICE_NOTE_PREFIX,
	buildInvoiceCreditNote,
	buildInvoicePaymentNote,
	buildInvoicePaymentNotePrefix,
	isInvoiceCreditNote,
} from "./constants";

const CARD = "card-1";
const PERIOD = "2026-07";

describe("nota de crédito de fatura", () => {
	const credito = buildInvoiceCreditNote(CARD, PERIOD, "fp-abc");

	it("herda o prefixo AUTO_FATURA para ficar fora de renda e despesa", () => {
		// As ~10 queries de relatorio filtram por `note NOT LIKE 'AUTO_FATURA:%'`.
		// Sem o prefixo, o credito entraria como receita no dashboard.
		expect(credito.startsWith(ACCOUNT_AUTO_INVOICE_NOTE_PREFIX)).toBe(true);
	});

	it("difere da nota do complemento, que o desfazer apaga por igualdade", () => {
		expect(credito).not.toBe(buildInvoicePaymentNote(CARD, PERIOD));
	});

	it("fica fora do prefixo de pagamento, que soma os parciais", () => {
		// sumInvoicePartialPayments soma tudo sob esse prefixo. O credito ja reduz
		// o total da fatura ao ser receita no cartao; contado aqui, seria abatido
		// duas vezes.
		expect(credito.startsWith(buildInvoicePaymentNotePrefix(CARD, PERIOD))).toBe(
			false,
		);
	});

	it("é reconhecível como crédito, e as notas de pagamento não são", () => {
		expect(isInvoiceCreditNote(credito)).toBe(true);
		expect(isInvoiceCreditNote(buildInvoicePaymentNote(CARD, PERIOD))).toBe(false);
		expect(
			isInvoiceCreditNote(`${buildInvoicePaymentNotePrefix(CARD, PERIOD)}xyz`),
		).toBe(false);
		expect(isInvoiceCreditNote(null)).toBe(false);
	});

	it("distingue créditos diferentes da mesma fatura", () => {
		expect(credito).not.toBe(buildInvoiceCreditNote(CARD, PERIOD, "fp-def"));
	});
});
