#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=upd-common.sh
source "$ROOT/upd-common.sh"

UPD_REPO_ROOT="$ROOT"
maybe_push
upd_ssh "${upd_use_node24}; ${upd_git_sync}; ~/src/scripts/deploy-backend.sh; ~/src/scripts/deploy-frontend.sh"
