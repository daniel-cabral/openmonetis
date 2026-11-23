import { createHash } from "node:crypto";

export const TEMP_DATABASE = "openmonetis_baseline_check";

export const SNAPSHOT_QUERIES = {
	columns: `SELECT rel.relname || '.' || att.attname || '|' || format_type(att.atttypid, att.atttypmod) || '|'
			|| CASE WHEN att.attnotnull THEN 'NO' ELSE 'YES' END || '|' || coalesce(pg_get_expr(def.adbin, def.adrelid), '') AS line
		FROM pg_attribute att
		JOIN pg_class rel ON rel.oid = att.attrelid AND rel.relkind = 'r'
		JOIN pg_namespace ns ON ns.oid = rel.relnamespace AND ns.nspname = 'public'
		LEFT JOIN pg_attrdef def ON def.adrelid = att.attrelid AND def.adnum = att.attnum
		WHERE att.attnum > 0 AND NOT att.attisdropped`,
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
