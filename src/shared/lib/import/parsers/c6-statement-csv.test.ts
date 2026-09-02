import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseC6StatementCsv } from "./c6-statement-csv";

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
	"c6-extrato.csv",
);

function readFixture() {
	return readFileSync(fixturePath, "utf8");
}

describe("parseC6StatementCsv", () => {
	it("extrai accountNumber de 'Agência: <a> / Conta: <c>'", () => {
		const result = parseC6StatementCsv(readFixture());
		expect(result.accountNumber).toBe("1/99999999");
	});

	it("extrai period de 'Extrato de <d1> a <d2>' em YYYY-MM-DD", () => {
		const result = parseC6StatementCsv(readFixture());
		expect(result.period).toEqual({ from: "2026-07-04", to: "2026-09-02" });
	});

	it("pula o preâmbulo e mapeia todas as linhas de dados", () => {
		const result = parseC6StatementCsv(readFixture());
		// 113 linhas de dados após os 9 de preâmbulo/header (contagem por inspeção da fixture)
		expect(result.transactions).toHaveLength(113);
		expect(result.transactions[0]).toMatchObject({
			date: "2026-07-05",
			postedDate: "2026-07-06",
			amount: 120,
			transactionType: "expense",
			dayBalance: 1007.11,
		});
	});

	it("deriva o sinal de Entrada(R$)/Saída(R$)", () => {
		const result = parseC6StatementCsv(readFixture());
		const recebido = result.transactions.find((t) =>
			t.sourceDescription.includes("Pix recebido c6 de Empresa Teste 1 LTDA"),
		);
		expect(recebido).toMatchObject({ transactionType: "income", amount: 2990.4 });
	});

	it("combina Título e Descrição sem duplicar quando forem iguais", () => {
		const result = parseC6StatementCsv(readFixture());
		const igual = result.transactions.find(
			(t) => t.date === "2026-07-09" && t.amount === 2990.4,
		);
		expect(igual?.description).toBe("Pix recebido c6 de Empresa Teste 1 LTDA");

		const diferente = result.transactions.find(
			(t) => t.date === "2026-07-05" && t.amount === 120,
		);
		expect(diferente?.description).toBe(
			"Pix enviado para Pessoa Teste 1 - observacao de teste",
		);
	});

	it("trata Descrição vazia usando apenas o Título", () => {
		const result = parseC6StatementCsv(readFixture());
		const iof = result.transactions.find((t) => t.date === "2026-09-02");
		expect(iof?.description).toBe("IOF CHEQUE ESPECIAL");
	});

	it("remove o BOM do início do arquivo", () => {
		const result = parseC6StatementCsv(readFixture());
		expect(result.transactions[0].description).not.toContain("﻿");
	});

	it("marca isCreditCard como false", () => {
		const result = parseC6StatementCsv(readFixture());
		expect(result.isCreditCard).toBe(false);
	});
});
