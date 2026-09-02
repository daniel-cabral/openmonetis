import { describe, expect, it } from "vitest";
import { parserProfiles } from "./registry";

describe("parserProfiles", () => {
	it("exporta a lista completa de perfis com id, label, kind, matches e parse", () => {
		expect(parserProfiles.length).toBeGreaterThanOrEqual(2);
		for (const profile of parserProfiles) {
			expect(typeof profile.id).toBe("string");
			expect(typeof profile.label).toBe("string");
			expect(["statement", "invoice"]).toContain(profile.kind);
			expect(typeof profile.matches).toBe("function");
			expect(typeof profile.parse).toBe("function");
		}
	});

	it("perfil de extrato C6 reconhece o cabeçalho do extrato", () => {
		const profile = parserProfiles.find((p) => p.id === "c6-statement");
		expect(profile).toBeDefined();
		expect(
			profile?.matches("Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)"),
		).toBe(true);
	});

	it("perfil de fatura C6 reconhece o cabeçalho da fatura", () => {
		const profile = parserProfiles.find((p) => p.id === "c6-invoice");
		expect(profile).toBeDefined();
		expect(
			profile?.matches(
				"Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)",
			),
		).toBe(true);
	});

	it("perfis não reconhecem cabeçalho de outro perfil", () => {
		const statement = parserProfiles.find((p) => p.id === "c6-statement");
		const invoice = parserProfiles.find((p) => p.id === "c6-invoice");
		expect(statement?.matches("qualquer coisa desconhecida")).toBe(false);
		expect(invoice?.matches("qualquer coisa desconhecida")).toBe(false);
	});
});
