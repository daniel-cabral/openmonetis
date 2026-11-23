import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	financialAccounts,
	investmentPositions,
	planningSettings,
} from "./schema";

describe("planning schema", () => {
	it.each([
		{
			table: planningSettings,
			name: "planejamento_ajustes",
			required: [
				"user_id",
				"aporte_planejado",
				"meses_reserva",
				"meses_base",
				"previsao_ipca",
				"previsao_incc",
				"estresse_meses_sem_renda",
				"estresse_custo_planos",
				"updated_at",
			],
			nullable: ["horizonte_fim", "estresse_teto_aporte", "modelo_planejador"],
		},
		{
			table: investmentPositions,
			name: "planejamento_posicoes",
			required: [
				"id",
				"user_id",
				"conta_id",
				"descricao",
				"valor",
				"liquidez",
				"data_referencia",
				"created_at",
			],
			nullable: ["mes_vencimento", "retorno_real_anual"],
		},
	])("$name mapeia as colunas do contrato", ({ table, name, required, nullable }) => {
		const config = getTableConfig(table);
		expect(config.name).toBe(name);

		const byName = new Map(
			config.columns.map((column) => [column.name, column]),
		);
		for (const column of required) {
			expect(byName.get(column)?.notNull, column).toBe(true);
		}
		for (const column of nullable) {
			expect(byName.get(column)?.notNull, column).toBe(false);
		}
	});

	it("posicao some junto com a conta de investimento", () => {
		const config = getTableConfig(investmentPositions);
		const accountFk = config.foreignKeys.find(
			(fk) => fk.reference().columns[0]?.name === "conta_id",
		);
		expect(accountFk?.onDelete).toBe("cascade");
		const foreignTable = accountFk?.reference().foreignTable;
		expect(foreignTable ? getTableConfig(foreignTable).name : null).toBe(
			"contas",
		);
	});

	it("contas.pote_reservado e obrigatoria", () => {
		const column = getTableConfig(financialAccounts).columns.find(
			(item) => item.name === "pote_reservado",
		);
		expect(column?.notNull).toBe(true);
	});
});
