import { describe, expect, it } from "vitest";
import { normalizeDecimalInput } from "./currency";

describe("normalizeDecimalInput", () => {
	const numero = (entrada: string) => Number(normalizeDecimalInput(entrada));

	it("aceita separador de milhar no formato pt-BR", () => {
		// Regressao: "12.164,10" virava "12.164.10" e Number() dava NaN. O campo
		// de total da fatura, o limite do cartao, o saldo inicial da conta e o
		// orcamento usam esta funcao — todos quebravam com milhar.
		expect(numero("12.164,10")).toBe(12164.1);
		expect(numero("1.234.567,89")).toBe(1234567.89);
		expect(numero("50.000,00")).toBe(50000);
	});

	it("continua aceitando o formato sem milhar", () => {
		expect(numero("12164,10")).toBe(12164.1);
		expect(numero("0,05")).toBe(0.05);
	});

	it("continua aceitando ponto como decimal quando não há vírgula", () => {
		// Sem vírgula não dá para distinguir milhar de decimal; manter o
		// comportamento antigo evita quebrar quem digita "1.5".
		expect(numero("12164.10")).toBe(12164.1);
		expect(numero("1.5")).toBe(1.5);
	});

	it("ignora espaços", () => {
		expect(numero(" 12.164,10 ")).toBe(12164.1);
		expect(numero("1 234,56")).toBe(1234.56);
	});

	it("preserva o sinal negativo", () => {
		expect(numero("-12.164,10")).toBe(-12164.1);
	});
});
