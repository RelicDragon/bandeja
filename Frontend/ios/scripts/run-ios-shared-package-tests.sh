#!/usr/bin/env bash
# Full SPM tests for iOS shared packages (#275): next-games cache + WatchConnectivity relay.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP="$ROOT/ios/App"

swift test --package-path "$APP/BandejaNextGames"
swift test --package-path "$APP/BandejaWatchShared"

echo "ios shared package tests OK"
