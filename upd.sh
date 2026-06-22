#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
UPD_BE_HOST="${UPD_BE_HOST:-relic@back.bandeja.com}"
UPD_FE_HOST="${UPD_FE_HOST:-relic@front.bandeja.com}"
UPD_SSH_KEY="${UPD_SSH_KEY:-$HOME/.ssh/id_hetzner}"

upd_ssh() {
  local host="$1"
  shift
  ssh \
    -o IdentitiesOnly=yes \
    -o IdentityFile="${UPD_SSH_KEY}" \
    -o AddressFamily=inet \
    -o StrictHostKeyChecking=accept-new \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3 \
    "${host}" "$@"
}

upd_git_sync='cd ~/src && git fetch origin && git reset --hard origin/master'
upd_use_node24='export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24'

deploy_be() {
  echo "→ backend ${UPD_BE_HOST}"
  upd_ssh "${UPD_BE_HOST}" "${upd_use_node24}; ${upd_git_sync}; ~/src/scripts/deploy-backend.sh"
}

deploy_fe() {
  echo "→ frontend ${UPD_FE_HOST}"
  upd_ssh "${UPD_FE_HOST}" "${upd_use_node24}; ${upd_git_sync}; ~/src/scripts/deploy-frontend.sh"
}

maybe_push() {
  local remote ahead
  remote="$(git -C "$ROOT" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || echo origin/master)"
  ahead="$(git -C "$ROOT" rev-list --count "${remote}"..HEAD 2>/dev/null || echo 0)"
  if [[ "${ahead}" -gt 0 ]]; then
    echo "push: pushing ${ahead} commit(s) to ${remote}"
    git -C "$ROOT" push
  fi
}

server_commit_be() {
  upd_ssh "${UPD_BE_HOST}" 'cd ~/src && git rev-parse HEAD'
}

server_commit_fe() {
  upd_ssh "${UPD_FE_HOST}" 'cd ~/src && git rev-parse HEAD'
}

path_needs_be() {
  case "$1" in
    Backend/*|scripts/deploy-backend.sh) return 0 ;;
    Frontend/shared/*) return 0 ;;
    packages/chat-contract/*) return 0 ;;
    *) return 1 ;;
  esac
}

path_needs_fe() {
  case "$1" in
    Frontend/*|scripts/deploy-frontend.sh) return 0 ;;
    packages/chat-contract/*) return 0 ;;
    *) return 1 ;;
  esac
}

diff_needs_deploy() {
  local from_sha="$1"
  local to_sha="$2"
  local checker="$3"
  local path

  [[ "${from_sha}" == "${to_sha}" ]] && return 1

  while IFS= read -r path; do
    [[ -z "${path}" ]] && continue
    if "${checker}" "${path}"; then
      return 0
    fi
  done < <(git -C "$ROOT" diff --name-only "${from_sha}" "${to_sha}")

  return 1
}

detect_deploy_target() {
  git -C "$ROOT" fetch origin master

  local deploy_ref be_sha fe_sha need_be=0 need_fe=0
  deploy_ref="$(git -C "$ROOT" rev-parse origin/master)"
  be_sha="$(server_commit_be)"
  fe_sha="$(server_commit_fe)"

  diff_needs_deploy "${be_sha}" "${deploy_ref}" path_needs_be && need_be=1
  diff_needs_deploy "${fe_sha}" "${deploy_ref}" path_needs_fe && need_fe=1

  if [[ "${need_be}" -eq 1 && "${need_fe}" -eq 1 ]]; then
    echo "all"
  elif [[ "${need_be}" -eq 1 ]]; then
    echo "be"
  elif [[ "${need_fe}" -eq 1 ]]; then
    echo "fe"
  else
    echo "none"
  fi
}

resolve_auto_target() {
  local detected deploy_ref be_sha fe_sha
  deploy_ref="$(git -C "$ROOT" rev-parse origin/master)"
  be_sha="$(server_commit_be)"
  fe_sha="$(server_commit_fe)"
  detected="$(detect_deploy_target)"

  case "${detected}" in
    none)
      if [[ "${be_sha}" == "${deploy_ref}" && "${fe_sha}" == "${deploy_ref}" ]]; then
        echo "deploy: both servers already at origin/master" >&2
      else
        echo "deploy: no deployable changes for servers behind master (be=${be_sha:0:7} fe=${fe_sha:0:7} → ${deploy_ref:0:7})" >&2
      fi
      exit 0
      ;;
    be) echo "deploy: backend needs update (${be_sha:0:7} → ${deploy_ref:0:7})" >&2 ;;
    fe) echo "deploy: frontend needs update (${fe_sha:0:7} → ${deploy_ref:0:7})" >&2 ;;
    all)
      echo "deploy: backend (${be_sha:0:7} → ${deploy_ref:0:7}) and frontend (${fe_sha:0:7} → ${deploy_ref:0:7})" >&2
      ;;
  esac
  echo "${detected}"
}

TARGET=auto
DO_PUSH=0

for arg in "$@"; do
  case "$arg" in
    all) TARGET=auto ;;
    both) TARGET=all ;;
    fe|frontend) TARGET=fe ;;
    be|backend) TARGET=be ;;
    push) DO_PUSH=1 ;;
    *)
      echo "usage: upd.sh [all|fe|be|both] [push]" >&2
      echo "  all     auto-detect from server..origin/master diff (default)" >&2
      echo "  both    force backend + frontend" >&2
      exit 1
      ;;
  esac
done

if [[ "$DO_PUSH" -eq 1 ]]; then
  maybe_push
fi

if [[ "$TARGET" == "auto" ]]; then
  TARGET="$(resolve_auto_target)"
fi

case "$TARGET" in
  all) deploy_be; deploy_fe ;;
  fe) deploy_fe ;;
  be) deploy_be ;;
esac
