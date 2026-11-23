import { createHash } from "node:crypto";

export const TEMP_DATABASE = "openmonetis_baseline_check";

export const SNAPSHOT_QUERIES = {
	columns: `SELECT table_name || '.' || column_name || '|' || data_type || '|' || is_nullable || '|' || coalesce(column_default, '') AS line
		FROM information_schema.columns WHERE table_schema = 'public'`,
	constraints: `SELECT rel.relname || '|' || pg_get_constraintdef(con.oid) AS line
		FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace ns ON ns.oid = rel.relnamespace
		WHERE ns.nspname = 'public'`,
	indexes: `SELECT regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX \\S+ ON', 'CREATE \\1INDEX ON') AS line
		FROM pg_indexes WHERE schemaname = 'public'`,
};

export function buildBaselineRows(journal, readSql) {
	return journal.entries.map((entry) => ({
		hash: createHash("sha256").update(readSql(entry.tag)).digest("hex"),
		createdAt: entry.when,
	}));
}

export function diffSchemas(expected, actual) {
	const diff = [];
	for (const key of ["columns", "constraints", "indexes"]) {
		const exp = new Set(expected[key]);
		const act = new Set(actual[key]);
		for (const line of [...exp].sort()) {
			if (!act.has(line)) diff.push(`faltando em produção: ${line}`);
		}
		for (const line of [...act].sort()) {
			if (!exp.has(line)) diff.push(`sobra em produção: ${line}`);
		}
	}
	return diff;
}

export function tempDatabaseUrl(url) {
	const parsed = new URL(url);
	parsed.pathname = `/${TEMP_DATABASE}`;
	return parsed.toString();
}
