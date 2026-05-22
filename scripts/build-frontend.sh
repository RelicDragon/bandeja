#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -f "$ROOT/Frontend/shared/sport.ts" ]]; then
  echo "error: Frontend/shared/sport.ts missing — deploy the full repo, not Frontend/ alone." >&2
  exit 1
fi
cd "$ROOT/Frontend"
npm run build
