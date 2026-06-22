#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DEV_BRANCH="${DEV_BRANCH:-dev}"
MASTER_BRANCH="${MASTER_BRANCH:-master}"
DO_DEPLOY=0

usage() {
  echo "usage: ship-master.sh [--deploy]" >&2
  echo "  merge ${DEV_BRANCH} → ${MASTER_BRANCH}, push; deploy runs in GitHub Actions after CI" >&2
}

for arg in "$@"; do
  case "$arg" in
    --deploy) DO_DEPLOY=1 ;;
    --no-deploy) DO_DEPLOY=0 ;;
    -h|--help) usage; exit 0 ;;
    *)
      usage
      exit 1
      ;;
  esac
done

if ! git -C "$ROOT" diff --quiet || ! git -C "$ROOT" diff --cached --quiet; then
  echo "error: uncommitted changes — commit on ${DEV_BRANCH} first" >&2
  exit 1
fi

if [[ -n "$(git -C "$ROOT" ls-files --others --exclude-standard)" ]]; then
  echo "error: untracked files — commit or stash on ${DEV_BRANCH} first" >&2
  exit 1
fi

START_BRANCH="$(git -C "$ROOT" branch --show-current)"

git -C "$ROOT" fetch origin "${DEV_BRANCH}" "${MASTER_BRANCH}"

git -C "$ROOT" checkout "${DEV_BRANCH}"
git -C "$ROOT" pull --ff-only origin "${DEV_BRANCH}"

dev_ahead="$(git -C "$ROOT" rev-list --count "origin/${DEV_BRANCH}..${DEV_BRANCH}" 2>/dev/null || echo 0)"
if [[ "${dev_ahead}" -gt 0 ]]; then
  echo "→ push ${DEV_BRANCH} (${dev_ahead} commit(s))"
  git -C "$ROOT" push origin "${DEV_BRANCH}"
fi

git -C "$ROOT" checkout "${MASTER_BRANCH}"
git -C "$ROOT" pull --ff-only origin "${MASTER_BRANCH}"

echo "→ merge ${DEV_BRANCH} into ${MASTER_BRANCH}"
git -C "$ROOT" merge --no-edit "${DEV_BRANCH}"

master_ahead="$(git -C "$ROOT" rev-list --count "origin/${MASTER_BRANCH}..${MASTER_BRANCH}" 2>/dev/null || echo 0)"
if [[ "${master_ahead}" -eq 0 ]]; then
  echo "→ ${MASTER_BRANCH} already up to date with ${DEV_BRANCH}"
else
  echo "→ push ${MASTER_BRANCH} (${master_ahead} commit(s))"
  git -C "$ROOT" push origin "${MASTER_BRANCH}"
fi

if [[ "${DO_DEPLOY}" -eq 1 ]]; then
  "${ROOT}/upd.sh"
fi

git -C "$ROOT" checkout "${START_BRANCH}"
