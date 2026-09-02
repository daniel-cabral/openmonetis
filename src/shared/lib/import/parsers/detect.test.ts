import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectParserProfile } from "./detect";
import { parserProfiles } from "./registry";

const fixturesDir = join(__dirname, "..", "..", "reconciliation", "__fixtures__");

describe("detectParserProfile", () => {
	it("detecta o perfil de extrato C6 e devolve a lista completa de perfis", () => {
		const content = readFileSync(join(fixturesDir, "c6-extrato.csv"), "utf-8");
		const result = detectParserProfile(content);
		expect(result.detected?.id).toBe("c6-statement");
		expect(result.profiles).toEqual(parserProfiles);
	});

	it("detecta o perfil de fatura C6 e devolve a lista completa de perfis", () => {
		const content = readFileSync(join(fixturesDir, "c6-fatura.csv"), "utf-8");
		const result = detectParserProfile(content);
		expect(result.detected?.id).toBe("c6-invoice");
		expect(result.profiles).toEqual(parserProfiles);
	});

	it("arquivo desconhecido devolve detected null e a lista de perfis, sem erro", () => {
		const result = detectParserProfile("conteudo completamente desconhecido\nsem cabecalho reconhecido");
		expect(result.detected).toBeNull();
		expect(result.profiles).toEqual(parserProfiles);
	});
});
