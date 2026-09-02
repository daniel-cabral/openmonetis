import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseC6InvoiceCsv } from "./c6-invoice-csv";

const fixturePath = join(
	__dirname,
	"..",
	"..",
	"..",
	"..",
	"shared",
	"lib",
	"reconciliation",
	"__fixtures__",
	"c6-fatura.csv",
);

function readFixture() {
	return readFileSync(fixturePath, "utf8");
}

describe("parseC6InvoiceCsv", () => {
	it("mapeia todas as linhas de dados da fatura", () => {
		const result = parseC6InvoiceCsv(readFixture());
		// 98 linhas de dados após o cabeçalho (contagem por inspeção da fixture)
		expect(result.transactions).toHaveLength(98);
	});

	it("mapeia data de compra, final do cartão, titular e categoria", () => {
		const result = parseC6InvoiceCsv(readFixture());
		const first = result.transactions[0];
		expect(first).toMatchObject({
			date: "2025-11-26",
			cardLast4: "1000",
			holderName: "Titular Teste 1",
			categoryRaw: "Recreativo",
			description: "FORMULA BIKE",
		});
	});

	it("interpreta Parcela no formato N/M", () => {
		const result = parseC6InvoiceCsv(readFixture());
		const first = result.transactions[0];
		expect(first.installment).toEqual({ number: 8, total: 12 });
	});

	it("interpreta Parcela 'Única' como ausência de parcelamento", () => {
		const result = parseC6InvoiceCsv(readFixture());
		const unica = result.transactions.find((t) => t.description === "GOOGLE ONE");
		expect(unica?.installment).toBeUndefined();
	});

	it("marca isPurchase: false para linhas negativas, preservando-as", () => {
		const result = parseC6InvoiceCsv(readFixture());
		const pagamento = result.transactions.find(
			(t) => t.description === "Pag Fatura Boleto",
		);
		const estorno = result.transactions.find(
			(t) => t.description === "Estorno Tarifa",
		);
		expect(pagamento).toBeDefined();
		expect(pagamento?.isPurchase).toBe(false);
		expect(pagamento?.transactionType).toBe("income");
		expect(pagamento?.amount).toBe(12164.1);

		expect(estorno).toBeDefined();
		expect(estorno?.isPurchase).toBe(false);
		expect(estorno?.amount).toBe(98);
	});

	it("marca isPurchase: true para linhas de compra normais", () => {
		const result = parseC6InvoiceCsv(readFixture());
		const compra = result.transactions.find((t) => t.description === "GOOGLE ONE");
		expect(compra?.isPurchase).toBe(true);
		expect(compra?.transactionType).toBe("expense");
		expect(compra?.amount).toBe(9.99);
	});

	it("extrai fx quando há valor em moeda estrangeira", () => {
		const result = parseC6InvoiceCsv(readFixture());
		const claude = result.transactions.find(
			(t) => t.description === "ANTHROPIC* CLAUDE SUB  SA" && t.amount === 577.26,
		);
		expect(claude?.fx).toEqual({ currency: "USD", amount: 107.37 });

		const semFx = result.transactions.find((t) => t.description === "GOOGLE ONE");
		expect(semFx?.fx).toBeUndefined();
	});

	it("marca isCreditCard como true", () => {
		const result = parseC6InvoiceCsv(readFixture());
		expect(result.isCreditCard).toBe(true);
	});
});
