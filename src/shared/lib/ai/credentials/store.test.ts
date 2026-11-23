import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { encryptSecret } from "./cipher";
import { AiCredentialInvalidError } from "./errors";
import {
	type AiCredentialDependencies,
	getProviderSecret,
	saveApiKeyCredential,
} from "./store";

type Row = Record<string, unknown>;

function createFakeDatabase() {
	const rows: Row[] = [];
	const wheres: unknown[] = [];
	const updates: Row[] = [];
	const database = {
		select: () => ({
			from: () => ({
				where: (condition: unknown) => {
					wheres.push(condition);
					return Promise.resolve(rows);
				},
			}),
		}),
		insert: () => ({
			values: (values: Row) => ({
				onConflictDoUpdate: () => {
					rows.push({ ...values });
					return Promise.resolve();
				},
			}),
		}),
		update: () => ({
			set: (values: Row) => ({
				where: (condition: unknown) => {
					wheres.push(condition);
					updates.push(values);
					Object.assign(rows[0] ?? {}, values);
					return Promise.resolve();
				},
			}),
		}),
	};
	return {
		database: database as unknown as NonNullable<
			AiCredentialDependencies["database"]
		>,
		rows,
		wheres,
		updates,
	};
}

const dialect = new PgDialect();

describe("api key credential store", () => {
	it("stores a key encrypted with only its mask readable and recovers it for the owner", async () => {
		const fake = createFakeDatabase();
		const deps = { database: fake.database, secret: "s" };

		const status = await saveApiKeyCredential(
			"u1",
			{ provider: "anthropic", apiKey: "sk-ant-api03-zzzzzzzzq8Lw" },
			deps,
		);

		expect(status).toMatchObject({
			status: "connected",
			secretMask: "sk-ant-…q8Lw",
		});
		expect(String(fake.rows[0]?.encryptedSecret)).not.toContain(
			"sk-ant-api03-zzzzzzzzq8Lw",
		);
		expect(await getProviderSecret("u1", "anthropic", deps)).toEqual({
			apiKey: "sk-ant-api03-zzzzzzzzq8Lw",
		});
		for (const condition of fake.wheres) {
			expect(
				dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0])
					.params,
			).toContain("u1");
		}
	});

	it("marks the row invalid when the secret no longer decrypts", async () => {
		const fake = createFakeDatabase();
		fake.rows.push({
			status: "connected",
			encryptedSecret: encryptSecret({ apiKey: "sk-x" }, "old"),
			baseUrl: null,
		});

		await expect(
			getProviderSecret("u1", "openai", {
				database: fake.database,
				secret: "new",
			}),
		).rejects.toBeInstanceOf(AiCredentialInvalidError);
		expect(fake.updates[0]).toMatchObject({ status: "invalid_secret" });
	});
});
