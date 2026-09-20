#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PBX="$ROOT/Frontend/ios/App/App.xcodeproj/project.pbxproj"
MAIN_IOS_BUNDLE_LINE='PRODUCT_BUNDLE_IDENTIFIER = com.funified.bandeja;'

# Reads MARKETING_VERSION / CURRENT_PROJECT_VERSION of the iOS App target (the values
# Backend/scripts/lib/app-release.ts bumps). Prints "<version> <build>".
read_main_ios_version() {
  awk -v want="$MAIN_IOS_BUNDLE_LINE" '
    /MARKETING_VERSION = / { mv = $3; sub(/;$/, "", mv) }
    /CURRENT_PROJECT_VERSION = / { cv = $3; sub(/;$/, "", cv) }
    {
      line = $0
      gsub(/^[ \t]+/, "", line)
      if (line == want) { print mv, cv; exit }
    }
  ' "$PBX"
}

# Copies the iOS App target's MARKETING_VERSION / CURRENT_PROJECT_VERSION onto every other
# target in project.pbxproj (watch app, watch widgets, home widgets, NotificationServiceExtension,
# test bundles). Embedded watch/extension bundles must carry the iOS app's version or App Store
# Connect rejects the archive. Pass --check to only report drift (exit 1 when out of sync).
sync_ios_target_versions() {
  local mode="${1:-write}"
  local version build
  read -r version build < <(read_main_ios_version)
  if [[ -z "${version:-}" || -z "${build:-}" ]]; then
    echo "app-release: could not read iOS version for '$MAIN_IOS_BUNDLE_LINE' in $PBX" >&2
    return 1
  fi

  local drift
  drift="$(grep -nE '^[[:space:]]*(MARKETING_VERSION|CURRENT_PROJECT_VERSION) = ' "$PBX" \
    | grep -vE "MARKETING_VERSION = ${version};|CURRENT_PROJECT_VERSION = ${build};" || true)"

  if [[ -z "$drift" ]]; then
    echo "app-release: all iOS targets already at ${version} (${build})."
    return 0
  fi

  if [[ "$mode" == "check" ]]; then
    echo "app-release: iOS target versions drift from App target ${version} (${build}):" >&2
    echo "$drift" >&2
    return 1
  fi

  local tmp
  tmp="$(mktemp)"
  sed -E \
    -e "s/^([[:space:]]*)MARKETING_VERSION = .*;$/\1MARKETING_VERSION = ${version};/" \
    -e "s/^([[:space:]]*)CURRENT_PROJECT_VERSION = .*;$/\1CURRENT_PROJECT_VERSION = ${build};/" \
    "$PBX" > "$tmp"
  mv "$tmp" "$PBX"
  echo "app-release: synced watch/widget/extension targets to ${version} (${build})."
}

case "${1:-}" in
  sync-ios-versions)
    sync_ios_target_versions "${2:-write}"
    exit $?
    ;;
  check-ios-versions)
    sync_ios_target_versions check
    exit $?
    ;;
esac

# Pre-flight: bring every embedded target up to the App target before the CLI plans the next
# bump. The CLI itself only rewrites the App + NotificationServiceExtension targets
# (IOS_VERSION_BUMP_BUNDLE_LINES in Backend/scripts/lib/app-release.ts), so run
# `./scripts/app-release.sh sync-ios-versions` again after a bump that skipped the watch targets.
if [[ -n "${APP_RELEASE_DRY_RUN:-}" ]]; then
  sync_ios_target_versions check || true
else
  sync_ios_target_versions
fi

cd "$ROOT/Backend"
exec npx ts-node -r dotenv/config scripts/app-release-cli.ts "$@"
