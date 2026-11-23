import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	assumptionLog,
	bidRecords,
	financialAccounts,
	investmentPositions,
	planCategoryMappings,
	planEvents,
	plannerConversations,
	plannerMessages,
	planningSettings,
	plans,
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
		{
			table: plans,
			name: "planejamento_planos",
			required: [
				"id",
				"user_id",
				"nome",
				"tipo",
				"prioridade",
				"inegociavel",
				"status",
				"base_valor",
				"indice",
				"mes_alvo",
				"contas_pote",
				"lance_embutido",
				"pct_lance_embutido",
				"created_at",
				"updated_at",
			],
			nullable: [
				"janela_inicio",
				"janela_fim",
				"valor_min",
				"valor_alvo",
				"valor_max",
				"valor_carta",
				"saldo_devedor",
				"base_lance",
				"margem_lance",
			],
		},
		{
			table: planEvents,
			name: "planejamento_eventos",
			required: [
				"id",
				"user_id",
				"plano_id",
				"descricao",
				"direcao",
				"base_valor",
				"valor_min",
				"valor",
				"valor_max",
				"mes_inicio",
				"created_at",
			],
			nullable: ["mes_fim"],
		},
		{
			table: bidRecords,
			name: "planejamento_lances",
			required: [
				"id",
				"user_id",
				"plano_id",
				"mes",
				"pct_vencedor",
				"created_at",
			],
			nullable: [],
		},
		{
			table: planCategoryMappings,
			name: "planejamento_categorias",
			required: ["id", "user_id", "plano_id", "categoria_id"],
			nullable: [],
		},
		{
			table: assumptionLog,
			name: "planejamento_premissas",
			required: [
				"id",
				"user_id",
				"tipo",
				"resumo",
				"origem",
				"created_at",
			],
			nullable: ["proposta_id", "revisar_em"],
		},
		{
			table: plannerConversations,
			name: "planejamento_conversas",
			required: ["id", "user_id", "titulo", "created_at", "updated_at"],
			nullable: [],
		},
		{
			table: plannerMessages,
			name: "planejamento_mensagens",
			required: [
				"id",
				"conversa_id",
				"user_id",
				"papel",
				"partes",
				"created_at",
			],
			nullable: [],
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

	it("lance por mes e categoria por usuario sao unicos", () => {
		const uniqueColumns = (table: PgTable) =>
			getTableConfig(table)
				.indexes.filter((index) => index.config.unique)
				.map((index) =>
					index.config.columns.map(
						(column) => (column as { name?: string }).name,
					),
				);

		expect(uniqueColumns(bidRecords)).toEqual([["plano_id", "mes"]]);
		expect(uniqueColumns(planCategoryMappings)).toEqual([
			["user_id", "categoria_id"],
		]);
		expect(uniqueColumns(assumptionLog)).toEqual([["user_id", "proposta_id"]]);
	});

	it("contas.pote_reservado e obrigatoria", () => {
		const column = getTableConfig(financialAccounts).columns.find(
			(item) => item.name === "pote_reservado",
		);
		expect(column?.notNull).toBe(true);
	});
});
