#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/Backend"
exec npx ts-node scripts/app-release-mark-shipped.ts "$@"
