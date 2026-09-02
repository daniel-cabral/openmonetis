import { describe, expect, it } from "vitest";
import { normalizeDescriptionKey } from "./import-utils";

describe("normalizeDescriptionKey", () => {
	it("derruba prefixo de adquirente PG * e o sufixo de praça", () => {
		expect(normalizeDescriptionKey("PG *ABC SUPERMERCADOS CONTAGEM BRA")).toBe(
			"abc supermercados",
		);
	});

	it("derruba prefixo de adquirente DM*", () => {
		expect(normalizeDescriptionKey("DM*hostingercomb")).toBe("hostingercomb");
	});

	it("derruba a praça separada por corrida de espaços, como o C6 exporta", () => {
		expect(
			normalizeDescriptionKey("DM*HOSTINGERCOMB   SAO PAULO   BRA"),
		).toBe("hostingercomb");
		expect(
			normalizeDescriptionKey("CINE RITZ DIVINOPOLI   DIVINOPOLIS   BRA"),
		).toBe("cine ritz divinopoli");
	});

	it("agrupa o mesmo lojista em praças diferentes na mesma chave", () => {
		expect(normalizeDescriptionKey("PG *LOJA TESTE   CONTAGEM   BRA")).toBe(
			normalizeDescriptionKey("PG *LOJA TESTE   BETIM   BRA"),
		);
	});

	it("preserva o lado do asterisco que identifica o lojista", () => {
		expect(normalizeDescriptionKey("MERCADOLIVRE*MERCADOL")).toBe(
			"mercadolivre",
		);
		expect(normalizeDescriptionKey("MP *ATACADINHOKID")).toBe("atacadinhokid");
		expect(normalizeDescriptionKey("B91*PH LANCHES")).toBe("ph lanches");
	});

	it("não derruba palavra final curta quando não há marcador de praça", () => {
		expect(normalizeDescriptionKey("BAR ESQUINA DA SOPA LT")).toBe(
			"bar esquina da sopa lt",
		);
	});

	it("derruba sufixo numérico de loja", () => {
		expect(normalizeDescriptionKey("DROGASIL2919")).toBe("drogasil");
	});

	it("derruba prefixo numérico de adquirente e sufixo numérico separado", () => {
		expect(normalizeDescriptionKey("223 LIV CTBA 23439130")).toBe("liv ctba");
	});
});
