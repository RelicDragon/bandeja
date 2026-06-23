#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASELINE_FILE="$ROOT/docs/app-release-baseline.txt"

if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "Missing $BASELINE_FILE" >&2
  exit 1
fi

BASELINE="$(tr -d '[:space:]' < "$BASELINE_FILE")"
if [[ -z "$BASELINE" ]]; then
  echo "Baseline file is empty: $BASELINE_FILE" >&2
  exit 1
fi

if ! git -C "$ROOT" cat-file -e "${BASELINE}^{commit}" 2>/dev/null; then
  echo "Unknown commit in baseline: $BASELINE" >&2
  exit 1
fi

FULL=false
for arg in "$@"; do
  case "$arg" in
    --full) FULL=true ;;
    -h|--help)
      echo "Usage: $0 [--full]"
      echo "  Lists commits after docs/app-release-baseline.txt."
      echo "  LLM release notes: ./scripts/app-release-whats-new.sh"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

COUNT="$(git -C "$ROOT" rev-list --count "${BASELINE}..HEAD")"
echo "# Changes since app release baseline ($BASELINE)"
echo "# Commits: $COUNT"
echo

if [[ "$COUNT" -eq 0 ]]; then
  echo "(none — HEAD is the baseline commit)"
  exit 0
fi

if [[ "$FULL" == true ]]; then
  git -C "$ROOT" log "${BASELINE}..HEAD" --reverse --format='- %s (%h)%n%b'
else
  git -C "$ROOT" log "${BASELINE}..HEAD" --reverse --format='- %s (%h)'
fi
