#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/Backend"
exec npx ts-node -r dotenv/config scripts/app-release-cli.ts
