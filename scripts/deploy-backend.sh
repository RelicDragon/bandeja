#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKEND="$REPO_ROOT/Backend"

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
npx prisma migrate deploy
# Client must exist before seed (ts-node typechecks / uses Prisma models).
npx prisma generate
# Official sticker packs (idempotent upsert + S3 when AWS configured).
# Without this, tray stays empty after STICKER migrations.
npm run seed:sticker-packs
npm run build
pm2 restart backend
