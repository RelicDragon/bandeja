#!/usr/bin/env bash
# Cross-platform next-game picker parity (#273). Fast local/CI gate.
set -euo pipefail

FRONTEND="$(cd "$(dirname "$0")/.." && pwd)"
cd "$FRONTEND"

echo "== JS =="
npm run test:next-game

echo "== Swift =="
./ios/scripts/run-next-game-golden-tests.sh

echo "== Android =="
./android/scripts/run-next-game-golden-tests.sh

echo "next-game parity OK"
