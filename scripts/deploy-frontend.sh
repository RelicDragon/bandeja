#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
FRONTEND="$REPO_ROOT/Frontend"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use 24
fi

node -v
npm -v
RELEASES="$FRONTEND/releases"
CONTRACT="$REPO_ROOT/packages/chat-contract"

if [[ ! -f "$CONTRACT/package.json" ]]; then
  echo "error: packages/chat-contract missing — deploy the full repo, not Frontend/ alone." >&2
  exit 1
fi

mkdir -p "$RELEASES"

if [[ -e "$FRONTEND/dist" && ! -L "$FRONTEND/dist" ]]; then
  legacy="legacy-$(date +%Y%m%d-%H%M%S)"
  mv "$FRONTEND/dist" "$RELEASES/$legacy"
  ln -sfn "releases/$legacy" "$FRONTEND/dist"
fi

RID="$(date +%Y%m%d-%H%M%S)"
WORKDIR="$(mktemp -d "/tmp/frontend-build-${RID}-XXXXXX")"

cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

mkdir -p "$WORKDIR/Frontend" "$WORKDIR/packages"

rsync -a \
  --exclude 'dist' \
  --exclude 'releases' \
  "$FRONTEND/" "$WORKDIR/Frontend/"

rsync -a "$CONTRACT/" "$WORKDIR/packages/chat-contract/"

cd "$WORKDIR/Frontend"
npm ci
npm run build

mv "$WORKDIR/Frontend/dist" "$RELEASES/$RID"

cd "$FRONTEND"

if [[ -L minus2 ]]; then
  rm -rf "$(readlink -f minus2)"
  rm minus2
fi

[[ -L minus1 ]] && mv minus1 minus2
[[ -L dist ]] && mv dist minus1

ln -sfn "releases/$RID" dist
