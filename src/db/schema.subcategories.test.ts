import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { importCategoryMappings, subcategories, transactions } from "./schema";

describe("subcategories schema", () => {
	it("pertence a uma categoria e a um usuario, com cascade", () => {
		const config = getTableConfig(subcategories);
		expect(config.name).toBe("subcategorias");

		const byName = new Map(
			config.columns.map((column) => [column.name, column]),
		);
		expect([...byName.keys()]).toEqual(
			expect.arrayContaining(["id", "nome", "categoria_id", "user_id"]),
		);
		for (const required of ["nome", "categoria_id", "user_id"]) {
			expect(byName.get(required)?.notNull).toBe(true);
		}

		for (const column of ["categoria_id", "user_id"]) {
			const fk = config.foreignKeys.find(
				(item) => item.reference().columns[0]?.name === column,
			);
			expect(fk?.onDelete).toBe("cascade");
		}
	});

	it.each([
		[transactions, "subcategoria_id"],
		[importCategoryMappings, "subcategory_id"],
	])("%s solta a subcategoria quando ela e excluida", (table, column) => {
		const config = getTableConfig(table);

		const subcategoryColumn = config.columns.find(
			(item) => item.name === column,
		);
		expect(subcategoryColumn).toBeDefined();
		expect(subcategoryColumn?.notNull).toBe(false);

		const fk = config.foreignKeys.find(
			(item) => item.reference().columns[0]?.name === column,
		);
		expect(fk?.onDelete).toBe("set null");
		const foreignTable = fk?.reference().foreignTable;
		expect(foreignTable ? getTableConfig(foreignTable).name : null).toBe(
			"subcategorias",
		);
	});
});
