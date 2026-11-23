import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { aiCredentials, aiPendingConnections } from "./schema";

describe("ai credentials schema", () => {
	it("ai credentials are unique per user and provider and cascade with the user", () => {
		const config = getTableConfig(aiCredentials);
		const index = config.indexes.find(
			(item) => item.config.name === "ia_credenciais_user_provider_idx",
		);
		expect(index?.config.unique).toBe(true);
		expect(
			index?.config.columns.map((column) => (column as { name?: string }).name),
		).toEqual(["user_id", "provedor"]);

		for (const table of [aiCredentials, aiPendingConnections]) {
			const fk = getTableConfig(table).foreignKeys.find(
				(item) => item.reference().columns[0]?.name === "user_id",
			);
			expect(fk?.onDelete).toBe("cascade");
		}
	});
});
