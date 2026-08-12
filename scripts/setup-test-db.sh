#!/usr/bin/env bash
#
# Provision a local PostgreSQL database for the integration suite.
#
# Creates two roles on purpose:
#   aicos_it_user — a NON-SUPERUSER member of aicos_app; the tests run as this
#                   role so row-level security is genuinely exercised. Running
#                   the suite as a superuser would pass while proving nothing,
#                   because superusers bypass RLS unconditionally.
#   postgres      — used only to seed tenants, which the application role is
#                   correctly not permitted to do.
#
# Usage:  ./scripts/setup-test-db.sh [dbname]
set -euo pipefail

DB="${1:-aicos_it}"
APP_PASS="${AICOS_IT_PASSWORD:-itpass}"
ADMIN_PASS="${AICOS_ADMIN_PASSWORD:-pgpass}"
DDL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/db/ddl"

as_pg() { su postgres -c "$1"; }

echo "==> Recreating database ${DB}"
as_pg "psql -qtA -c \"DROP DATABASE IF EXISTS ${DB};\"" >/dev/null
as_pg "psql -qtA -c \"CREATE DATABASE ${DB};\"" >/dev/null

# pgvector is optional locally; substitute a text column so the schema still
# applies on a stock PostgreSQL install.
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
for f in "${DDL_DIR}"/0*.sql; do
  if as_pg "psql -qtA -d ${DB} -c \"SELECT 1 FROM pg_available_extensions WHERE name='vector'\"" | grep -q 1; then
    cp "$f" "${WORK}/$(basename "$f")"
  else
    sed -e 's/CREATE EXTENSION IF NOT EXISTS "vector";/-- pgvector not installed locally/' \
        -e 's/vector(1024)/text/' \
        -e 's|USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)|(embedding)|' \
        "$f" > "${WORK}/$(basename "$f")"
  fi
done
chmod -R a+rX "${WORK}"

echo "==> Applying schema"
for f in "${WORK}"/0*.sql; do
  as_pg "psql -q -v ON_ERROR_STOP=1 -d ${DB} -f ${f}"
  echo "    applied $(basename "$f")"
done

echo "==> Creating roles"
as_pg "psql -q -d ${DB}" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aicos_it_user') THEN
    CREATE ROLE aicos_it_user LOGIN PASSWORD '${APP_PASS}';
  ELSE
    ALTER ROLE aicos_it_user WITH LOGIN PASSWORD '${APP_PASS}';
  END IF;
END \$\$;
GRANT aicos_app TO aicos_it_user;
ALTER ROLE postgres WITH PASSWORD '${ADMIN_PASS}';
SQL

echo
echo "Ready. Run the suite with:"
echo
echo "  AICOS_TEST_DATABASE_URL=\"postgres://aicos_it_user:${APP_PASS}@127.0.0.1:5432/${DB}\" \\"
echo "  AICOS_TEST_ADMIN_DATABASE_URL=\"postgres://postgres:${ADMIN_PASS}@127.0.0.1:5432/${DB}\" \\"
echo "  npx vitest run --root apps/api"
