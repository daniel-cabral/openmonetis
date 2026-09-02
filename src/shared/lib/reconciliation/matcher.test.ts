import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseC6InvoiceCsv } from "../import/parsers/c6-invoice-csv";
import type { ImportedTransaction } from "../import/types";
import {
	type AppTransaction,
	findCentsCandidates,
	findExactCandidates,
	findFingerprintCandidates,
	findInstallmentCandidates,
	matchReconciliationRows,
	type ReconciliationRow,
} from "./matcher";

const faturaPath = join(__dirname, "__fixtures__", "c6-fatura.csv");

function row(overrides: Partial<ImportedTransaction> = {}): ImportedTransaction {
	return {
		externalId: null,
		externalIdOccurrence: 0,
		date: "2026-07-10",
		amount: 25.9,
		description: "LOJA TESTE",
		sourceDescription: "LOJA TESTE",
		transactionType: "expense",
		...overrides,
	};
}

function entry(
	overrides: Partial<ImportedTransaction> = {},
	fingerprint = "fp-linha",
): ReconciliationRow {
	return { fingerprint, row: row(overrides) };
}

function transaction(overrides: Partial<AppTransaction> = {}): AppTransaction {
	return {
		id: "tx-1",
		name: "Lançamento teste",
		date: "2026-07-10",
		amount: 25.9,
		transactionType: "expense",
		installmentCount: null,
		currentInstallment: null,
		fingerprint: null,
		...overrides,
	};
}

function idsOf(candidates: AppTransaction[]): string[] {
	return candidates.map((candidate) => candidate.id);
}

describe("findFingerprintCandidates", () => {
	it("acha o lançamento que já tem o fingerprint da linha gravado", () => {
		const candidates = findFingerprintCandidates(entry({}, "fp-a"), [
			transaction({ id: "tx-1", fingerprint: "fp-a" }),
			transaction({ id: "tx-2", fingerprint: "fp-b" }),
		]);

		expect(idsOf(candidates)).toEqual(["tx-1"]);
	});

	it("não confunde lançamento sem fingerprint com linha alguma", () => {
		const candidates = findFingerprintCandidates(entry({}, "fp-a"), [
			transaction({ id: "tx-1", fingerprint: null }),
		]);

		expect(candidates).toEqual([]);
	});
});

describe("findInstallmentCandidates", () => {
	it("casa parcela N/M com a série de mesmo total, mesma parcela e mesmo valor", () => {
		const candidates = findInstallmentCandidates(
			entry({ amount: 1800, installment: { number: 2, total: 12 } }),
			[
				transaction({
					id: "tx-serie",
					amount: 1800,
					installmentCount: 12,
					currentInstallment: 2,
					date: "2026-05-30",
				}),
			],
		);

		expect(idsOf(candidates)).toEqual(["tx-serie"]);
	});

	it("não casa quando o total de parcelas difere", () => {
		const candidates = findInstallmentCandidates(
			entry({ amount: 1800, installment: { number: 2, total: 12 } }),
			[
				transaction({
					id: "tx-serie",
					amount: 1800,
					installmentCount: 10,
					currentInstallment: 2,
				}),
			],
		);

		expect(candidates).toEqual([]);
	});

	it("não casa quando a parcela atual difere", () => {
		const candidates = findInstallmentCandidates(
			entry({ amount: 1800, installment: { number: 2, total: 12 } }),
			[
				transaction({
					id: "tx-serie",
					amount: 1800,
					installmentCount: 12,
					currentInstallment: 3,
				}),
			],
		);

		expect(candidates).toEqual([]);
	});

	it("não considera linha sem informação de parcela", () => {
		const candidates = findInstallmentCandidates(entry({ amount: 1800 }), [
			transaction({
				id: "tx-serie",
				amount: 1800,
				installmentCount: 12,
				currentInstallment: 2,
			}),
		]);

		expect(candidates).toEqual([]);
	});
});

describe("findExactCandidates", () => {
	it("casa valor com sinal idêntico dentro de ±1 dia da data de lançamento", () => {
		const candidates = findExactCandidates(entry({ date: "2026-07-10" }), [
			transaction({ id: "tx-anterior", date: "2026-07-09" }),
			transaction({ id: "tx-posterior", date: "2026-07-11" }),
			transaction({ id: "tx-longe", date: "2026-07-12" }),
		]);

		expect(idsOf(candidates)).toEqual(["tx-anterior", "tx-posterior"]);
	});

	it("também casa contra a data contábil, com a mesma folga", () => {
		const candidates = findExactCandidates(
			entry({ date: "2026-07-10", postedDate: "2026-07-14" }),
			[transaction({ id: "tx-contabil", date: "2026-07-15" })],
		);

		expect(idsOf(candidates)).toEqual(["tx-contabil"]);
	});

	it("não casa despesa com receita de mesmo valor absoluto", () => {
		const candidates = findExactCandidates(
			entry({ transactionType: "expense" }),
			[transaction({ id: "tx-receita", transactionType: "income" })],
		);

		expect(candidates).toEqual([]);
	});

	it("não casa diferença de centavos", () => {
		const candidates = findExactCandidates(entry({ amount: 86.59 }), [
			transaction({ id: "tx-app", amount: 86.61 }),
		]);

		expect(candidates).toEqual([]);
	});
});

describe("findCentsCandidates", () => {
	it("casa diferença de até R$ 0,05 quando a linha tem parcela", () => {
		const candidates = findCentsCandidates(
			entry({ amount: 86.59, installment: { number: 2, total: 3 } }),
			[transaction({ id: "tx-app", amount: 86.61 })],
		);

		expect(idsOf(candidates)).toEqual(["tx-app"]);
	});

	it("não casa nada quando a linha não tem parcela", () => {
		const candidates = findCentsCandidates(entry({ amount: 86.59 }), [
			transaction({ id: "tx-app", amount: 86.61 }),
		]);

		expect(candidates).toEqual([]);
	});

	it("não estica a tolerância além de R$ 0,05", () => {
		const candidates = findCentsCandidates(
			entry({ amount: 86.59, installment: { number: 2, total: 3 } }),
			[transaction({ id: "tx-app", amount: 86.65 })],
		);

		expect(candidates).toEqual([]);
	});

	it("respeita a mesma janela de data da regra exata", () => {
		const candidates = findCentsCandidates(
			entry({
				date: "2026-07-10",
				amount: 86.59,
				installment: { number: 2, total: 3 },
			}),
			[transaction({ id: "tx-app", date: "2026-07-13", amount: 86.61 })],
		);

		expect(candidates).toEqual([]);
	});
});

describe("matchReconciliationRows", () => {
	it("aplica as regras na ordem: fingerprint vence parcela", () => {
		const result = matchReconciliationRows({
			rows: [
				entry({ amount: 1800, installment: { number: 2, total: 12 } }, "fp-a"),
			],
			transactions: [
				transaction({
					id: "tx-serie",
					amount: 1800,
					installmentCount: 12,
					currentInstallment: 2,
				}),
				transaction({ id: "tx-conciliado", amount: 1800, fingerprint: "fp-a" }),
			],
		});

		expect(result.rows[0]).toMatchObject({
			status: "matched",
			rule: "fingerprint",
			transactionId: "tx-conciliado",
		});
	});

	it("prefere a regra de parcela à exata quando as duas encontram candidato", () => {
		const result = matchReconciliationRows({
			rows: [
				entry(
					{
						date: "2026-07-10",
						amount: 1800,
						installment: { number: 2, total: 12 },
					},
					"fp-a",
				),
			],
			transactions: [
				transaction({ id: "tx-avista", amount: 1800, date: "2026-07-10" }),
				transaction({
					id: "tx-serie",
					amount: 1800,
					date: "2026-01-10",
					installmentCount: 12,
					currentInstallment: 2,
				}),
			],
		});

		expect(result.rows[0]).toMatchObject({
			status: "matched",
			rule: "installment",
			transactionId: "tx-serie",
		});
	});

	it("casa por valor exato quando o candidato é único", () => {
		const result = matchReconciliationRows({
			rows: [entry({}, "fp-a")],
			transactions: [transaction({ id: "tx-1" })],
		});

		expect(result.rows[0]).toMatchObject({
			status: "matched",
			rule: "exact",
			transactionId: "tx-1",
		});
		expect(result.appOnlyIds).toEqual([]);
	});

	it("casa 86,59 contra 86,61 quando há parcela e não casa sem parcela", () => {
		const transactions = [transaction({ id: "tx-app", amount: 86.61 })];

		const comParcela = matchReconciliationRows({
			rows: [
				entry({ amount: 86.59, installment: { number: 2, total: 3 } }, "fp-a"),
			],
			transactions,
		});
		const semParcela = matchReconciliationRows({
			rows: [entry({ amount: 86.59 }, "fp-a")],
			transactions,
		});

		expect(comParcela.rows[0]).toMatchObject({
			status: "matched",
			rule: "cents",
			transactionId: "tx-app",
		});
		expect(semParcela.rows[0]).toMatchObject({ status: "bank-only" });
		expect(semParcela.appOnlyIds).toEqual(["tx-app"]);
	});

	it("marca como ambígua a linha com dois candidatos e não escolhe nenhum", () => {
		const result = matchReconciliationRows({
			rows: [entry({}, "fp-a")],
			transactions: [
				transaction({ id: "tx-1", date: "2026-07-10" }),
				transaction({ id: "tx-2", date: "2026-07-11" }),
			],
		});

		expect(result.rows[0]).toMatchObject({
			status: "ambiguous",
			candidateIds: ["tx-1", "tx-2"],
		});
	});

	it("não deixa regra mais fraca resolver linha que a regra mais forte achou ambígua", () => {
		const result = matchReconciliationRows({
			rows: [
				entry(
					{
						date: "2026-07-10",
						amount: 1800,
						installment: { number: 2, total: 12 },
					},
					"fp-a",
				),
			],
			transactions: [
				transaction({
					id: "tx-serie-a",
					amount: 1800,
					date: "2026-01-10",
					installmentCount: 12,
					currentInstallment: 2,
				}),
				transaction({
					id: "tx-serie-b",
					amount: 1800,
					date: "2026-02-10",
					installmentCount: 12,
					currentInstallment: 2,
				}),
				transaction({ id: "tx-avista", amount: 1800, date: "2026-07-10" }),
			],
		});

		expect(result.rows[0]).toMatchObject({
			status: "ambiguous",
			candidateIds: ["tx-serie-a", "tx-serie-b"],
		});
		expect(result.appOnlyIds).toEqual(["tx-avista"]);
	});

	it("não devolve como só no app o candidato de uma linha ambígua", () => {
		const result = matchReconciliationRows({
			rows: [entry({}, "fp-a")],
			transactions: [
				transaction({ id: "tx-1", date: "2026-07-10" }),
				transaction({ id: "tx-2", date: "2026-07-11" }),
				transaction({ id: "tx-orfao", amount: 999, date: "2026-07-20" }),
			],
		});

		expect(result.appOnlyIds).toEqual(["tx-orfao"]);
	});

	it("detecta o lançamento sem linha correspondente como só no app", () => {
		const result = matchReconciliationRows({
			rows: [entry({}, "fp-a")],
			transactions: [
				transaction({ id: "tx-1" }),
				transaction({ id: "tx-orfao", amount: 42, date: "2026-07-02" }),
			],
		});

		expect(result.rows[0]).toMatchObject({ status: "matched" });
		expect(result.appOnlyIds).toEqual(["tx-orfao"]);
	});

	it("não deixa duas linhas casarem com o mesmo lançamento", () => {
		const result = matchReconciliationRows({
			rows: [entry({}, "fp-a"), entry({}, "fp-b")],
			transactions: [transaction({ id: "tx-1" })],
		});

		expect(result.rows[0]).toMatchObject({
			status: "matched",
			transactionId: "tx-1",
		});
		expect(result.rows[1]).toMatchObject({ status: "bank-only" });
	});

	it("resolve a linha que sobra com candidato único depois de outra consumir o candidato disputado", () => {
		const result = matchReconciliationRows({
			rows: [
				entry({ date: "2026-07-11" }, "fp-disputa"),
				entry({ date: "2026-07-10" }, "fp-unica"),
			],
			transactions: [
				transaction({ id: "tx-1", date: "2026-07-10" }),
				transaction({ id: "tx-2", date: "2026-07-12" }),
			],
		});

		expect(result.rows[1]).toMatchObject({
			status: "matched",
			transactionId: "tx-1",
		});
		expect(result.rows[0]).toMatchObject({
			status: "matched",
			transactionId: "tx-2",
		});
	});

	it("classifica a linha sem candidato algum como só no banco", () => {
		const result = matchReconciliationRows({
			rows: [entry({ amount: 12.34 }, "fp-a")],
			transactions: [transaction({ id: "tx-1", amount: 99.99 })],
		});

		expect(result.rows[0]).toMatchObject({ status: "bank-only" });
	});

	it("preserva índice, fingerprint e linha original em cada classificação", () => {
		const result = matchReconciliationRows({
			rows: [entry({ description: "LOJA TESTE" }, "fp-a")],
			transactions: [],
		});

		expect(result.rows[0].index).toBe(0);
		expect(result.rows[0].fingerprint).toBe("fp-a");
		expect(result.rows[0].row.description).toBe("LOJA TESTE");
	});

	it("casa a linha de 86,59 da fixture de fatura contra o lançamento de 86,61 do app", () => {
		const parsed = parseC6InvoiceCsv(readFileSync(faturaPath, "utf8"));
		const target = parsed.transactions.find(
			(candidate) => candidate.description === "LOJA ESPACO TESTE",
		);
		if (!target) throw new Error("fixture sem a linha LOJA ESPACO TESTE");

		const result = matchReconciliationRows({
			rows: [{ fingerprint: "fp-space", row: target }],
			transactions: [
				transaction({
					id: "tx-space",
					date: target.date,
					amount: 86.61,
					installmentCount: 3,
					currentInstallment: 2,
				}),
			],
		});

		expect(result.rows[0]).toMatchObject({
			status: "matched",
			transactionId: "tx-space",
		});
	});
});
