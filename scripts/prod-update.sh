#!/usr/bin/env bash
# Reference deploy script for /home/relic/update.sh — run from repo root (/home/relic/src).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> git pull"
git pull --ff-only

echo "==> Backend: install, prisma, build (flat dist/)"
cd "$ROOT/Backend"
npm ci
npx prisma generate
npx prisma migrate deploy
rm -rf dist
npm run build

if ! grep -q "primary-sport/confirm" dist/routes/user.routes.js; then
  echo "ERROR: dist/routes/user.routes.js missing multisport routes — fix tsconfig rootDir" >&2
  exit 1
fi

echo "==> Frontend: build (requires Frontend/shared/)"
cd "$ROOT/Frontend"
if [[ ! -f shared/sport.ts ]]; then
  echo "ERROR: deploy full monorepo; Frontend/shared/sport.ts missing" >&2
  exit 1
fi
npm ci
npm run build

echo "==> restart API (adjust to your process manager)"
# pm2 restart padelpulse || systemctl restart padelpulse
echo "Restart backend manually if not using pm2."

echo "==> smoke"
curl -sf -o /dev/null -w "health %{http_code}\n" https://bandeja.me/api/health
code=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "https://bandeja.me/api/users/primary-sport/confirm" -H "Content-Type: application/json" -d '{}')
echo "primary-sport/confirm (expect 401, not 404): HTTP $code"
if [[ "$code" == "404" ]]; then
  echo "ERROR: API still on old build" >&2
  exit 1
fi

echo "Deploy steps finished."
