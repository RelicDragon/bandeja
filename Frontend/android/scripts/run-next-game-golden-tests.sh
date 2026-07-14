#!/usr/bin/env bash
# Runs Android NextGamePickerTest against shared catalog (#273).
# Fixture: Frontend/shared/nextGame/pickNextGameGolden.json
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ANDROID="$ROOT/android"
FIXTURE="$ROOT/shared/nextGame/pickNextGameGolden.json"

if [[ ! -f "$FIXTURE" ]]; then
  echo "missing fixture catalog: $FIXTURE" >&2
  exit 1
fi

cd "$ANDROID"

# Avoid flaky incremental classpath-snapshot races after concurrent cleans.
./gradlew :bandeja-widgets:testDebugUnitTest \
  --tests 'com.funified.bandeja.widgets.NextGamePickerTest' \
  --no-build-cache
