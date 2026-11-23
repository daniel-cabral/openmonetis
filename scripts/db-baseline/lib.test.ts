import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildBaselineRows, diffSchemas, tempDatabaseUrl } from "./lib.mjs";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const base = {
	columns: ["contas.id|text|NO|", "contas.saldo|numeric|NO|0"],
	constraints: ["contas.contas_pkey|PRIMARY KEY (id)"],
	indexes: ["CREATE INDEX a ON public.contas USING btree (id)"],
};

describe("buildBaselineRows", () => {
	it("hasheia cada sql e usa o when do journal, na ordem do journal", () => {
		const journal = {
			entries: [
				{ tag: "0000_a", when: 1 },
				{ tag: "0001_b", when: 2 },
			],
		};
		const files: Record<string, string> = { "0000_a": "A", "0001_b": "B" };
		expect(buildBaselineRows(journal, (tag: string) => files[tag])).toEqual([
			{ hash: sha("A"), createdAt: 1 },
			{ hash: sha("B"), createdAt: 2 },
		]);
	});
});

describe("diffSchemas", () => {
	it("ignora ordem dos itens", () => {
		const shuffled = { ...base, columns: [...base.columns].reverse() };
		expect(diffSchemas(base, shuffled)).toEqual([]);
	});

	it("aponta default divergente de coluna", () => {
		const actual = {
			...base,
			columns: ["contas.id|text|NO|", "contas.saldo|numeric|NO|"],
		};
		expect(diffSchemas(base, actual).join("\n")).toContain("contas.saldo");
	});

	it("aponta nulabilidade divergente de coluna", () => {
		const actual = {
			...base,
			columns: ["contas.id|text|NO|", "contas.saldo|numeric|YES|0"],
		};
		expect(diffSchemas(base, actual).join("\n")).toContain("contas.saldo");
	});

	it("marca indice so em producao como sobra e so nas migrations como faltando", () => {
		const idx = "CREATE INDEX b ON public.contas USING btree (saldo)";
		const extra = { ...base, indexes: [...base.indexes, idx] };
		expect(diffSchemas(base, extra)).toEqual([`sobra em produção: ${idx}`]);
		expect(diffSchemas(extra, base)).toEqual([`faltando em produção: ${idx}`]);
	});
});

describe("tempDatabaseUrl", () => {
	it("troca so o nome do banco", () => {
		expect(tempDatabaseUrl("postgresql://u:p@db:5432/openmonetis_db")).toBe(
			"postgresql://u:p@db:5432/openmonetis_baseline_check",
		);
	});
});
