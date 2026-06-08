#!/usr/bin/env bash
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
  if [[ "${PUSH:-0}" != "1" ]]; then
    return 0
  fi
  local root="${UPD_REPO_ROOT:?set UPD_REPO_ROOT before maybe_push}"
  local remote ahead
  remote="$(git -C "$root" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || echo origin/master)"
  ahead="$(git -C "$root" rev-list --count "${remote}"..HEAD 2>/dev/null || echo 0)"
  if [[ "${ahead}" -gt 0 ]]; then
    echo "PUSH=1: pushing ${ahead} commit(s) to ${remote}"
    git -C "$root" push
  fi
}
