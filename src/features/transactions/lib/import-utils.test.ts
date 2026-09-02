import { describe, expect, it } from "vitest";
import { normalizeDescriptionKey } from "./import-utils";

describe("normalizeDescriptionKey", () => {
	it("derruba prefixo de adquirente PG *", () => {
		expect(normalizeDescriptionKey("PG *ABC SUPERMERCADOS CONTAGEM BRA")).toBe(
			"abc supermercados contagem bra",
		);
	});

	it("derruba prefixo de adquirente DM*", () => {
		expect(normalizeDescriptionKey("DM*hostingercomb SAO PAULO BRA")).toBe(
			"hostingercomb sao paulo bra",
		);
	});

	it("derruba prefixo de adquirente MP *", () => {
		expect(normalizeDescriptionKey("MERCADOLIVRE*MERCADOL")).toBe("mercadol");
	});

	it("derruba sufixo numérico de loja", () => {
		expect(normalizeDescriptionKey("DROGASIL2919")).toBe("drogasil");
	});

	it("derruba prefixo numérico de adquirente tipo B91*", () => {
		expect(normalizeDescriptionKey("223 LIV CTBA 23439130")).toBe("liv ctba");
	});
});
