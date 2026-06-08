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
npx prisma generate
npm run build
pm2 restart backend
