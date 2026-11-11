import { describe, expect, it } from "vitest";
import { isUnreconciledSettled } from "./unreconciled";

describe("isUnreconciledSettled", () => {
	it.each([
		// [S: Mensalidade marcada como paga por engano]
		[
			"pago depois da primeira conciliação, sem fingerprint",
			{ isSettled: true, purchaseDate: "2026-11-22", ofxImportFingerprint: null },
			"2026-09-01",
			true,
		],
		[
			"pago e conciliado",
			{ isSettled: true, purchaseDate: "2026-11-22", ofxImportFingerprint: "fp" },
			"2026-09-01",
			false,
		],
		[
			"pendente",
			{ isSettled: false, purchaseDate: "2026-11-22", ofxImportFingerprint: null },
			"2026-09-01",
			false,
		],
		// [S: Histórico anterior à primeira conciliação fica limpo]
		[
			"pago antes da primeira conciliação",
			{ isSettled: true, purchaseDate: "2026-08-31", ofxImportFingerprint: null },
			"2026-09-01",
			false,
		],
		[
			"conta sem nenhuma conciliação",
			{ isSettled: true, purchaseDate: "2026-11-22", ofxImportFingerprint: null },
			null,
			false,
		],
	])("%s", (_, tx, firstReconciledDate, expected) => {
		expect(isUnreconciledSettled(tx, firstReconciledDate)).toBe(expected);
	});
});
