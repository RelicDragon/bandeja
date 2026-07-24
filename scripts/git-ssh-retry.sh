#!/usr/bin/env bash
# Retries SSH for git when GitHub intermittently rejects publickey.
set -euo pipefail
max=5
delay=1
attempt=1
while true; do
  if ssh -o IdentityAgent=none -o IdentitiesOnly=yes "$@"; then
    exit 0
  fi
  status=$?
  if (( attempt >= max )); then
    exit "$status"
  fi
  sleep "$delay"
  attempt=$((attempt + 1))
  delay=$((delay * 2))
done
