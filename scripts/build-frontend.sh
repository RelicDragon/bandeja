#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -f "$ROOT/packages/chat-contract/package.json" ]]; then
  echo "error: packages/chat-contract missing — deploy the full repo, not Frontend/ alone." >&2
  exit 1
fi
if [[ ! -f "$ROOT/packages/unread-contract/package.json" ]]; then
  echo "error: packages/unread-contract missing — deploy the full repo, not Frontend/ alone." >&2
  exit 1
fi
cd "$ROOT/Frontend"
npm run build
