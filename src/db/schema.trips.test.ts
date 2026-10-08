import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { transactions, trips } from "./schema";

describe("trips schema", () => {
	it("mapeia a tabela viagens com as colunas do contrato", () => {
		const config = getTableConfig(trips);
		expect(config.name).toBe("viagens");

		const byName = new Map(
			config.columns.map((column) => [column.name, column]),
		);
		expect([...byName.keys()]).toEqual(
			expect.arrayContaining([
				"id",
				"user_id",
				"nome",
				"data_inicio",
				"data_fim",
				"anotacao",
				"created_at",
			]),
		);
		for (const required of ["user_id", "nome", "data_inicio", "data_fim"]) {
			expect(byName.get(required)?.notNull).toBe(true);
		}
		expect(byName.get("anotacao")?.notNull).toBe(false);

		const userFk = config.foreignKeys.find(
			(fk) => fk.reference().columns[0]?.name === "user_id",
		);
		expect(userFk?.onDelete).toBe("cascade");
	});

	it("lancamentos.viagem_id solta o lançamento quando a viagem é excluída", () => {
		const config = getTableConfig(transactions);

		const tripColumn = config.columns.find(
			(column) => column.name === "viagem_id",
		);
		expect(tripColumn).toBeDefined();
		expect(tripColumn?.notNull).toBe(false);

		const tripFk = config.foreignKeys.find(
			(fk) => fk.reference().columns[0]?.name === "viagem_id",
		);
		expect(tripFk?.onDelete).toBe("set null");
		const foreignTable = tripFk?.reference().foreignTable;
		expect(foreignTable ? getTableConfig(foreignTable).name : null).toBe(
			"viagens",
		);

		const index = config.indexes.find(
			(idx) => idx.config.name === "lancamentos_user_id_viagem_id_idx",
		);
		expect(
			index?.config.columns.map((column) =>
				"name" in column ? column.name : "",
			),
		).toEqual(["user_id", "viagem_id"]);
	});
});
