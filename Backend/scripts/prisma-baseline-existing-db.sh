#!/usr/bin/env bash
# One-time: reset _prisma_migrations on a DB that already has the full schema.
# Does NOT run baseline SQL — only marks it applied. Safe for prod/dev with data.
set -euo pipefail

cd "$(dirname "$0")/.."

BASELINE="${PRISMA_BASELINE_MIGRATION:-20260613120000_baseline}"

if [[ -z "${DB_URL:-}" ]]; then
  if [[ -f .env ]]; then
    set -a
    # shellcheck source=/dev/null
    source .env
    set +a
  fi
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
read -r -p "Continue? [y/N] " confirm
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
