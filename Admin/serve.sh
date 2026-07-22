#!/usr/bin/env bash
# Same-origin Admin UI on 127.0.0.1:9010 with /api proxy.
#   ./Admin/serve.sh           # proxy → prod tunnel :9000
#   ./Admin/serve.sh --dev     # proxy → local backend :3000
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ "${1:-}" == "--dev" ]]; then
  export ADMIN_API_TARGET="${ADMIN_API_TARGET:-http://127.0.0.1:3000}"
  shift
else
  export ADMIN_API_TARGET="${ADMIN_API_TARGET:-http://127.0.0.1:9000}"
fi

export ADMIN_PORT="${ADMIN_PORT:-9010}"
exec node "${ROOT}/serve.mjs" "$@"
