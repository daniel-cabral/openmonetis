import { describe, expect, it } from "vitest";
import type { DetectResult } from "@/shared/lib/import/parsers/detect";
import type { ParserProfile } from "@/shared/lib/import/parsers/registry";
import {
	destinationKindForProfile,
	resolveDefaultProfileId,
} from "./reconciliation-origin";

const statementProfile: ParserProfile = {
	id: "c6-statement",
	label: "C6 Bank - Extrato de conta corrente",
	kind: "statement",
	matches: () => true,
	parse: () => {
		throw new Error("not used in test");
	},
};

const invoiceProfile: ParserProfile = {
	id: "c6-invoice",
	label: "C6 Bank - Fatura de cartão",
	kind: "invoice",
	matches: () => true,
	parse: () => {
		throw new Error("not used in test");
	},
};

describe("resolveDefaultProfileId", () => {
	it("usa o perfil detectado quando existe", () => {
		const detectResult: DetectResult = {
			detected: invoiceProfile,
			profiles: [statementProfile, invoiceProfile],
		};
		expect(resolveDefaultProfileId(detectResult)).toBe("c6-invoice");
	});

	it("cai para o primeiro perfil da lista quando nada é detectado", () => {
		const detectResult: DetectResult = {
			detected: null,
			profiles: [statementProfile, invoiceProfile],
		};
		expect(resolveDefaultProfileId(detectResult)).toBe("c6-statement");
	});

	it("devolve null quando não há nenhum perfil disponível", () => {
		const detectResult: DetectResult = { detected: null, profiles: [] };
		expect(resolveDefaultProfileId(detectResult)).toBeNull();
	});
});

describe("destinationKindForProfile", () => {
	it("perfil de extrato exige conta", () => {
		expect(destinationKindForProfile(statementProfile)).toBe("account");
	});

	it("perfil de fatura exige cartão", () => {
		expect(destinationKindForProfile(invoiceProfile)).toBe("card");
	});

	it("sem perfil selecionado não há destino resolvido", () => {
		expect(destinationKindForProfile(null)).toBeNull();
	});
});
