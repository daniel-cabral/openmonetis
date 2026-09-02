import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const extratoPath = join(__dirname, "c6-extrato.csv");
const faturaPath = join(__dirname, "c6-fatura.csv");

function readRaw(path: string) {
	return readFileSync(path, "utf8");
}

describe("fixtures mascaradas do C6", () => {
	it("extrato preserva preambulo de 8 linhas com BOM e header na linha 9", () => {
		const raw = readRaw(extratoPath);
		expect(raw.charCodeAt(0)).toBe(0xfeff);
		const lines = raw.slice(1).split(/\r\n/);
		expect(lines[0]).toContain("EXTRATO DE CONTA CORRENTE C6 BANK");
		expect(lines[2]).toMatch(/^Agência: \d+ \/ Conta: \d+$/);
		expect(lines[8]).toBe(
			"Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)",
		);
	});

	it("extrato tem defasagem entre Data Lançamento e Data Contábil de -1 a +2 dias", () => {
		const raw = readRaw(extratoPath);
		const dataLines = raw
			.slice(1)
			.split(/\r\n/)
			.slice(9)
			.filter((l) => l.trim() !== "");

		function toDate(br: string) {
			const [d, m, y] = br.split("/").map(Number);
			return Date.UTC(y, m - 1, d);
		}

		const diffsInDays = dataLines.map((line) => {
			const [lancamento, contabil] = line.split(",");
			return (toDate(contabil) - toDate(lancamento)) / 86_400_000;
		});

		expect(Math.min(...diffsInDays)).toBe(-1);
		expect(Math.max(...diffsInDays)).toBe(2);
	});

	it("extrato fecha Saldo do Dia por Data Contábil (linhas do mesmo dia contábil repetem o saldo)", () => {
		const raw = readRaw(extratoPath);
		const dataLines = raw
			.slice(1)
			.split(/\r\n/)
			.slice(9)
			.filter((l) => l.trim() !== "");

		const saldoPorDiaContabil = new Map<string, Set<string>>();
		for (const line of dataLines) {
			const cols = line.split(",");
			const contabil = cols[1];
			const saldo = cols[6];
			if (!saldoPorDiaContabil.has(contabil)) saldoPorDiaContabil.set(contabil, new Set());
			saldoPorDiaContabil.get(contabil)?.add(saldo);
		}
		for (const saldos of saldoPorDiaContabil.values()) {
			expect(saldos.size).toBe(1);
		}
	});

	it("fatura tem cabeçalho separado por ; e coluna Parcela com formato N/M e Única", () => {
		const raw = readRaw(faturaPath);
		const lines = raw.split(/\r\n/).filter((l) => l.trim() !== "");
		expect(lines[0].split(";")[5]).toBe("Parcela");

		const parcelas = lines.slice(1).map((l) => l.split(";")[5]);
		expect(parcelas.some((p) => /^\d+\/\d+$/.test(p))).toBe(true);
		expect(parcelas.some((p) => p === "Única")).toBe(true);
	});

	it("fatura preserva linhas negativas de Pag Fatura Boleto e Estorno Tarifa", () => {
		const raw = readRaw(faturaPath);
		const lines = raw.split(/\r\n/).filter((l) => l.trim() !== "");

		const boleto = lines.find((l) => l.includes("Pag Fatura Boleto"));
		const estorno = lines.find((l) => l.includes("Estorno Tarifa"));

		expect(boleto).toBeDefined();
		expect(estorno).toBeDefined();
		expect(Number(boleto?.split(";").at(-1))).toBeLessThan(0);
		expect(Number(estorno?.split(";").at(-1))).toBeLessThan(0);
	});

	it("fatura contém o valor 86.59 (LOJA SPACE BC) usado no caso de divergência de centavos com o app (86.61)", () => {
		const raw = readRaw(faturaPath);
		const lines = raw.split(/\r\n/);
		const linha = lines.find((l) => l.includes("LOJA SPACE BC"));
		expect(linha).toBeDefined();
		expect(Number(linha?.split(";").at(-1))).toBeCloseTo(86.59, 2);
		// O lado "app" (86.61) não vem de arquivo: é o lançamento pré-existente
		// no sistema, usado como fixture inline nos testes do matcher (task 6.6).
	});

	it("fixtures não contêm nomes reais de pessoas do arquivo original", () => {
		const extrato = readRaw(extratoPath);
		const fatura = readRaw(faturaPath);
		for (const nomeReal of ["Daniel Cabral", "Aline", "Ludmila Helena", "Fernanda M Fernandes"]) {
			expect(extrato).not.toContain(nomeReal);
			expect(fatura).not.toContain(nomeReal);
		}
	});
});
