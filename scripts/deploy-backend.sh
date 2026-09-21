#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKEND="$REPO_ROOT/Backend"
RUN_HEAVY="$REPO_ROOT/scripts/run-heavy"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use 24
fi

node -v
npm -v

cd "$BACKEND"
npm ci
"$RUN_HEAVY" npx prisma migrate deploy
# Client must exist before seed (ts-node typechecks / uses Prisma models).
"$RUN_HEAVY" npx prisma generate
# ts-node seed loads env.ts → @bandeja/app-locale (and other workspace packages).
"$RUN_HEAVY" npm run prebuild
# Official sticker packs (idempotent upsert + S3 when AWS configured).
# Without this, tray stays empty after STICKER migrations.
npm run seed:sticker-packs
# NS Padel Centar club row (idempotent upsert, deploy-safe skip when city
# missing). Without this, fresh dev/prod deploys get no club for the
# NSPADELSUPABASE integration.
npm run seed:nspadel-centar
# The full compiler uses more than the ~2 GB heap Node selects on this host.
# Scope the larger budget to compilation; do not pass it to the PM2 restart.
NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=${BACKEND_BUILD_HEAP_MB:-4096}" \
  "$RUN_HEAVY" npm run build
pm2 restart backend
