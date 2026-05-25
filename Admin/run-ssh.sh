#!/bin/bash
set -euo pipefail

SSH_KEY="${HOME}/.ssh/id_hetzner"
SSH_OPTS=(
  -o ExitOnForwardFailure=yes
  -o ServerAliveInterval=60
  -o ServerAliveCountMax=3
)

cleanup() {
  kill "${DB_PID:-}" "${ADMIN_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [[ ! -f "${SSH_KEY}" ]]; then
  echo "SSH key not found: ${SSH_KEY}"
  exit 1
fi

if [[ -z "${SSH_AUTH_SOCK:-}" ]]; then
  echo "Starting ssh-agent..."
  eval "$(ssh-agent -s)"
  trap 'kill "${DB_PID:-}" "${ADMIN_PID:-}" 2>/dev/null; kill "${SSH_AGENT_PID:-}" 2>/dev/null' EXIT INT TERM
else
  trap cleanup EXIT INT TERM
fi

echo "Add SSH key (enter passphrase once):"
ssh-add "${SSH_KEY}" 2>&1 | grep -v "already in the agent" || true

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
ssh -N "${SSH_OPTS[@]}" -L 127.0.0.1:15432:127.0.0.1:5432 -i "${SSH_KEY}" relic@188.245.101.10 &
DB_PID=$!
wait_for_port 15432 "DB" "${DB_PID}"

echo "Admin UI: localhost:9000 -> back.bandeja.com:8080"
ssh -N "${SSH_OPTS[@]}" -L 127.0.0.1:9000:127.0.0.1:8080 -i "${SSH_KEY}" root@back.bandeja.com &
ADMIN_PID=$!
wait_for_port 9000 "Admin" "${ADMIN_PID}"

echo "Tunnels up (Ctrl+C to stop)"
wait
