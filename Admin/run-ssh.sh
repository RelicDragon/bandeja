#!/bin/bash
set -euo pipefail

SSH_KEY="${HOME}/.ssh/id_hetzner"
SSH_OPTS=(
  -o ExitOnForwardFailure=yes
  -o ServerAliveInterval=60
  -o ServerAliveCountMax=3
  -o IdentitiesOnly=yes
  -o IdentityFile="${SSH_KEY}"
)

cleanup() {
  kill "${DB_PID:-}" "${ADMIN_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [[ ! -f "${SSH_KEY}" ]]; then
  echo "SSH key not found: ${SSH_KEY}"
  exit 1
fi

has_working_agent() {
  if [[ -z "${SSH_AUTH_SOCK:-}" ]]; then
    return 1
  fi
  ssh-add -l >/dev/null 2>&1
  local rc=$?
  # ssh-add -l:
  # 0 => keys loaded, 1 => no keys loaded, 2 => no reachable agent.
  [[ "${rc}" -ne 2 ]]
}

if ! has_working_agent; then
  echo "Starting ssh-agent..."
  eval "$(ssh-agent -s)"
  export SSH_AUTH_SOCK SSH_AGENT_PID
  trap 'kill "${DB_PID:-}" "${ADMIN_PID:-}" 2>/dev/null; kill "${SSH_AGENT_PID:-}" 2>/dev/null' EXIT INT TERM
else
  export SSH_AUTH_SOCK
  trap cleanup EXIT INT TERM
fi

key_fingerprint() {
  ssh-keygen -lf "${SSH_KEY}" -E sha256 2>/dev/null | awk '{print $2}'
}

key_in_agent() {
  local fp
  fp=$(key_fingerprint) || return 1
  ssh-add -l 2>/dev/null | grep -qF "${fp}"
}

ensure_key_loaded() {
  if key_in_agent; then
    return 0
  fi
  echo "Unlock SSH key (once):"
  if [[ "$(uname -s)" == Darwin ]]; then
    ssh-add --apple-use-keychain "${SSH_KEY}" 2>/dev/null \
      || ssh-add -K "${SSH_KEY}"
  else
    ssh-add "${SSH_KEY}"
  fi
}

ensure_key_loaded

wait_for_port() {
  local port=$1 name=$2 pid=$3
  local i
  for ((i = 0; i < 30; i++)); do
    if ! kill -0 "${pid}" 2>/dev/null; then
      echo "${name} tunnel failed (ssh exited)"
      return 1
    fi
    if lsof -iTCP:"${port}" -sTCP:LISTEN -P >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
  done
  echo "${name} tunnel failed (port ${port} not listening)"
  return 1
}

echo "DB:       localhost:15432 -> 188.245.101.10:5432"
ssh -N "${SSH_OPTS[@]}" -L 127.0.0.1:15432:127.0.0.1:5432 relic@188.245.101.10 &
DB_PID=$!
wait_for_port 15432 "DB" "${DB_PID}"

# API only (Admin UI is ./Admin/serve.sh on :9010). Use relic→:3000 — no root@ needed.
echo "Admin API: localhost:9000 -> back.bandeja.com:3000"
ssh -N "${SSH_OPTS[@]}" -L 127.0.0.1:9000:127.0.0.1:3000 relic@back.bandeja.com &
ADMIN_PID=$!
wait_for_port 9000 "Admin API" "${ADMIN_PID}"

echo "Tunnels up (Ctrl+C to stop)"
echo ""
echo "Admin panel (same-origin, required):"
echo "  ./Admin/serve.sh"
echo "  open http://127.0.0.1:9010/   (login API URL: /api)"
echo "Local backend instead of tunnel:"
echo "  ./Admin/serve.sh --dev"
echo "Do not open Admin/index.html via file://"
wait
