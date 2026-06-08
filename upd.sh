#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
UPD_SSH_HOST="${UPD_SSH_HOST:-relic@back.bandeja.com}"
UPD_SSH_KEY="${UPD_SSH_KEY:-$HOME/.ssh/id_hetzner}"

upd_ssh() {
  ssh \
    -o IdentitiesOnly=yes \
    -o IdentityFile="${UPD_SSH_KEY}" \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3 \
    "${UPD_SSH_HOST}" "$@"
}

upd_git_sync='cd ~/src && git fetch origin && git reset --hard origin/master'
upd_use_node24='export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24'

maybe_push() {
  local remote ahead
  remote="$(git -C "$ROOT" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || echo origin/master)"
  ahead="$(git -C "$ROOT" rev-list --count "${remote}"..HEAD 2>/dev/null || echo 0)"
  if [[ "${ahead}" -gt 0 ]]; then
    echo "push: pushing ${ahead} commit(s) to ${remote}"
    git -C "$ROOT" push
  fi
}

TARGET=all
DO_PUSH=0

for arg in "$@"; do
  case "$arg" in
    all) TARGET=all ;;
    fe|frontend) TARGET=fe ;;
    be|backend) TARGET=be ;;
    push) DO_PUSH=1 ;;
    *)
      echo "usage: upd.sh [all|fe|be] [push]" >&2
      exit 1
      ;;
  esac
done

if [[ "$DO_PUSH" -eq 1 ]]; then
  maybe_push
fi

case "$TARGET" in
  all)
    upd_ssh "${upd_use_node24}; ${upd_git_sync}; ~/src/scripts/deploy-backend.sh; ~/src/scripts/deploy-frontend.sh"
    ;;
  fe)
    upd_ssh "${upd_use_node24}; ${upd_git_sync}; ~/src/scripts/deploy-frontend.sh"
    ;;
  be)
    upd_ssh '~/update.sh'
    ;;
esac
