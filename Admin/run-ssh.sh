#!/bin/bash
set -euo pipefail

SSH_KEY="${HOME}/.ssh/id_hetzner"

cleanup() {
  kill "${DB_PID:-}" "${ADMIN_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "DB:       localhost:15432 -> 188.245.101.10:5432"
ssh -N -L 127.0.0.1:15432:127.0.0.1:5432 -i "$SSH_KEY" relic@188.245.101.10 &
DB_PID=$!

echo "Admin UI: localhost:9000 -> back.bandeja.com:8080"
ssh -N -L 127.0.0.1:9000:127.0.0.1:8080 -i "$SSH_KEY" root@back.bandeja.com &
ADMIN_PID=$!

echo "Tunnels up (Ctrl+C to stop)"
wait
npm run reconcile:sport-profile-level-from-events