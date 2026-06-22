#!/usr/bin/env bash
# Runs the full BandejaWatchWatchTests target (engine, outbox, API config, format, etc.).
# Golden subsets: run-watch-serve-guide-golden-tests.sh, run-watch-scoring-golden-tests.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT="$ROOT/ios/App/App.xcodeproj"
SCHEME="BandejaWatch Watch App"

if [[ -n "${WATCH_TEST_DESTINATION:-}" ]]; then
  DESTINATION="$WATCH_TEST_DESTINATION"
else
  WATCH_UDID="$(xcrun simctl list devices available watchOS 2>/dev/null \
    | grep 'Apple Watch' \
    | head -1 \
    | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' \
    | head -1)"
  if [[ -z "$WATCH_UDID" ]]; then
    echo "no available watchOS Simulator; set WATCH_TEST_DESTINATION" >&2
    exit 1
  fi
  DESTINATION="platform=watchOS Simulator,id=${WATCH_UDID}"
fi

xcodebuild test \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -destination "$DESTINATION" \
  -only-testing:BandejaWatchWatchTests
