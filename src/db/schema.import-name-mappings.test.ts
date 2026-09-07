import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { importNameMappings } from "./schema";

describe("importNameMappings", () => {
	it("mapeia para a tabela import_name_mappings com as colunas esperadas", () => {
		const config = getTableConfig(importNameMappings);

		expect(config.name).toBe("import_name_mappings");

		const columnNames = config.columns.map((column) => column.name);
		expect(columnNames).toEqual(
			expect.arrayContaining(["user_id", "description_key", "name", "updated_at"]),
		);

		const userIdColumn = config.columns.find((column) => column.name === "user_id");
		expect(userIdColumn?.notNull).toBe(true);

		const descriptionKeyColumn = config.columns.find(
			(column) => column.name === "description_key",
		);
		expect(descriptionKeyColumn?.notNull).toBe(true);

		const nameColumn = config.columns.find((column) => column.name === "name");
		expect(nameColumn?.notNull).toBe(true);

		expect(config.primaryKeys).toHaveLength(1);
		const pkColumnNames = config.primaryKeys[0]?.columns.map((column) => column.name);
		expect(pkColumnNames).toEqual(
			expect.arrayContaining(["user_id", "description_key"]),
		);
	});
});
