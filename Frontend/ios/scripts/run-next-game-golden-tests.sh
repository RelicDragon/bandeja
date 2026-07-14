#!/usr/bin/env bash
# Runs BandejaNextGames PickNextGameGoldenFixturesTests against shared catalog (#273).
# Fixture: Frontend/shared/nextGame/pickNextGameGolden.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="$ROOT/ios/App/BandejaNextGames"
FIXTURE="$ROOT/shared/nextGame/pickNextGameGolden.json"

if [[ ! -f "$FIXTURE" ]]; then
  echo "missing fixture catalog: $FIXTURE" >&2
  exit 1
fi

cd "$PKG"
swift test --filter PickNextGameGoldenFixturesTests
