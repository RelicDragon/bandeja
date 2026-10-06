#!/usr/bin/env bash
# One-time: reset _prisma_migrations on a DB that already has the full schema.
# Does NOT run baseline SQL — only marks it applied. Safe for prod/dev with data.
set -euo pipefail

cd "$(dirname "$0")/.."

BASELINE="${PRISMA_BASELINE_MIGRATION:-20261006140000_baseline}"

# Only DB_URL is read from .env: sourcing the whole file breaks on multi-line values.
if [[ -z "${DB_URL:-}" && -f .env ]]; then
  DB_URL="$(grep -E '^DB_URL=' .env | tail -1 | cut -d= -f2- | sed -E 's/^["'\'']//; s/["'\'']$//')"
  export DB_URL
fi

if [[ -z "${DB_URL:-}" ]]; then
  echo "Set DB_URL (or .env with DB_URL) before running." >&2
  exit 1
fi

echo "Target: ${DB_URL%%@*}@***"
echo "Baseline migration: ${BASELINE}"
echo ""
echo "This clears padelpulse._prisma_migrations and marks baseline as applied."
echo "Schema and data are not modified."
confirm="n"
if [[ "${1:-}" == "--yes" ]]; then
  confirm="y"
else
  read -r -p "Continue? [y/N] " confirm
fi
if [[ "${confirm}" != [yY] ]]; then
  echo "Aborted."
  exit 1
fi

npx prisma db execute --stdin <<'SQL'
DELETE FROM "_prisma_migrations";
SQL

npx prisma migrate resolve --applied "${BASELINE}"

echo ""
echo "Done. Verify with: npx prisma migrate deploy"
