// Baseline único das migrations em um banco criado por `drizzle-kit push`.
// Uso no container: NODE_PATH=/app/migrate/node_modules node /app/scripts/db-baseline/run.mjs [--apply]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
	buildBaselineRows,
	diffSchemas,
	SNAPSHOT_QUERIES,
	TEMP_DATABASE,
	tempDatabaseUrl,
} from "./lib.mjs";

// createRequire respeita NODE_PATH, que aponta para /app/migrate/node_modules no container.
const require = createRequire(import.meta.url);
const { Client } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");

const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));
const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL não definida.");
	process.exit(1);
}

async function snapshot(client) {
	const result = {};
	for (const [key, query] of Object.entries(SNAPSHOT_QUERIES)) {
		const { rows } = await client.query(query);
		result[key] = rows.map((row) => row.line);
	}
	return result;
}

async function expectedSnapshot() {
	const temp = new Client({ connectionString: tempDatabaseUrl(url) });
	await temp.connect();
	try {
		await migrate(drizzle(temp), { migrationsFolder: MIGRATIONS });
		return await snapshot(temp);
	} finally {
		await temp.end();
	}
}

const prod = new Client({ connectionString: url });
await prod.connect();
let exitCode = 0;
try {
	const existing = await prod.query(
		"SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present",
	);
	if (existing.rows[0].present) {
		const { rows } = await prod.query(
			"SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
		);
		if (rows[0].n > 0) {
			console.error(`Baseline já feito: ${rows[0].n} migrations registradas.`);
			process.exit(1);
		}
	}

	await prod.query(`DROP DATABASE IF EXISTS ${TEMP_DATABASE}`);
	await prod.query(`CREATE DATABASE ${TEMP_DATABASE}`);
	let diff;
	try {
		diff = diffSchemas(await expectedSnapshot(), await snapshot(prod));
	} finally {
		await prod.query(`DROP DATABASE IF EXISTS ${TEMP_DATABASE}`);
	}

	const journal = JSON.parse(
		readFileSync(`${MIGRATIONS}/meta/_journal.json`, "utf8"),
	);
	const rows = buildBaselineRows(journal, (tag) =>
		readFileSync(`${MIGRATIONS}/${tag}.sql`, "utf8"),
	);

	if (diff.length > 0) {
		console.error(
			`Schema de produção diverge das migrations (${diff.length} diferenças). Nada foi registrado.`,
		);
		for (const line of diff) console.error(`  ${line}`);
		exitCode = 1;
	} else if (!apply) {
		console.log(
			`Schema idêntico. ${rows.length} migrations prontas para registro. Rode de novo com --apply.`,
		);
	} else {
		await prod.query("BEGIN");
		await prod.query("CREATE SCHEMA IF NOT EXISTS drizzle");
		await prod.query(
			"CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)",
		);
		for (const row of rows) {
			await prod.query(
				"INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
				[row.hash, row.createdAt],
			);
		}
		await prod.query("COMMIT");
		console.log(`Registradas ${rows.length} migrations.`);
	}
} finally {
	await prod.end();
}
process.exit(exitCode);
