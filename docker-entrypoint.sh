#!/bin/sh

export NODE_PATH=/app/migrate/node_modules

# Sai com 2 quando o banco tem tabelas mas nenhum histórico de migrations
# (criado por drizzle-kit push). Erro de conexão sai com 1 e entra no retry.
check_legacy() {
  node -e '
const { Client } = require("pg");
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect()
  .then(() => c.query("SELECT to_regclass(\x27public.lancamentos\x27) IS NOT NULL AS app, to_regclass(\x27drizzle.__drizzle_migrations\x27) IS NOT NULL AS hist"))
  .then((r) => c.end().then(() => process.exit(r.rows[0].app && !r.rows[0].hist ? 2 : 0)))
  .catch(() => process.exit(1));
'
}

echo "Rodando migrations..."
MIGRATED=0
for i in 1 2 3 4 5; do
  check_legacy
  STATUS=$?
  if [ "$STATUS" -eq 2 ]; then
    echo "Erro: banco existente sem histórico de migrations. Rode o baseline uma vez:"
    echo "  NODE_PATH=/app/migrate/node_modules node /app/scripts/db-baseline/run.mjs --apply"
    exit 1
  fi
  if [ "$STATUS" -eq 0 ] && /app/migrate/node_modules/.bin/drizzle-kit migrate; then
    MIGRATED=1
    break
  fi
  echo "Tentativa $i/5 falhou. Aguardando 5s..."
  sleep 5
done

if [ "$MIGRATED" -eq 0 ]; then
  echo "Erro: migrations não foram aplicadas. O app não será iniciado."
  exit 1
fi

exec "$@"
