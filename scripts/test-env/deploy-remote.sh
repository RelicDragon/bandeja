#!/usr/bin/env bash
set -euo pipefail

# Runs as relic on the frontend server after the local source tree is rsynced.

TEST_HOST="${TEST_HOST:-thisistestfor.bandeja.me}"
TEST_ROOT="${TEST_ROOT:-/home/relic/bandeja-test}"
TEST_BACKEND_PORT="${TEST_BACKEND_PORT:-3100}"
TEST_DB_NAME="padelpulse_test"
TEST_DB_ROLE="padelpulse_test"
PM2_PROCESS="bandeja-test-backend"
SOURCE="$TEST_ROOT/source"
CONFIG_DIR="$TEST_ROOT/config"
BACKEND="$SOURCE/Backend"
FRONTEND="$SOURCE/Frontend"
RELEASES="$TEST_ROOT/frontend-releases"
DEPLOY_REVISION="${DEPLOY_REVISION:-unknown}"
DEPLOY_DIRTY="${DEPLOY_DIRTY:-unknown}"

if [[ "$TEST_ROOT" != "/home/relic/bandeja-test" ]]; then
  echo "Refusing unexpected test root: $TEST_ROOT" >&2
  exit 1
fi
if [[ ! "$TEST_HOST" =~ ^[a-z0-9.-]+$ ]]; then
  echo "Invalid test hostname: $TEST_HOST" >&2
  exit 1
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use 24
fi

if [[ "$(node -p 'process.versions.node.split(`.`)[0]')" != "24" ]]; then
  echo "Node 24 is required; found $(node -v)" >&2
  exit 1
fi

GENERATED_ENV="$CONFIG_DIR/generated.env"
if [[ ! -f "$GENERATED_ENV" ]]; then
  echo "Missing $GENERATED_ENV; run deploy-test.sh --provision first" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "$GENERATED_ENV"
if [[ ! "$TEST_DB_PASSWORD" =~ ^[a-f0-9]{48}$ ]]; then
  echo "Invalid generated database password" >&2
  exit 1
fi
if [[ ! "$TEST_JWT_SECRET" =~ ^[a-f0-9]{96}$ ]]; then
  echo "Invalid generated JWT secret" >&2
  exit 1
fi

umask 077
BACKEND_ENV_TMP="$BACKEND/.env.test-deploy"
cat > "$BACKEND_ENV_TMP" <<ENV
NODE_ENV=development
APP_ENV=development
HOST=127.0.0.1
PORT=${TEST_BACKEND_PORT}
TRUST_PROXY=1

DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=${TEST_DB_NAME}
DB_USER=${TEST_DB_ROLE}
DB_PASSWORD=${TEST_DB_PASSWORD}
DB_SCHEMA=padelpulse
DB_URL=postgresql://${TEST_DB_ROLE}:${TEST_DB_PASSWORD}@127.0.0.1:5432/${TEST_DB_NAME}?schema=padelpulse
DATABASE_URL=postgresql://${TEST_DB_ROLE}:${TEST_DB_PASSWORD}@127.0.0.1:5432/${TEST_DB_NAME}?schema=padelpulse

JWT_SECRET=${TEST_JWT_SECRET}
JWT_EXPIRES_IN=90d
JWT_ACCESS_EXPIRES_IN=30m
REFRESH_TOKEN_EXPIRES_IN=60d
REFRESH_TOKEN_ENABLED=true
REFRESH_WEB_HTTPONLY_COOKIE=true
REFRESH_WEB_HTTPONLY_JSON_BODY=false
REFRESH_COOKIE_NAME=pp_test_rt
REFRESH_COOKIE_SECURE=true
REFRESH_COOKIE_SAME_SITE=lax

FRONTEND_URL=https://${TEST_HOST}
CORS_ALLOWED_ORIGINS=https://${TEST_HOST}
RATE_LIMIT_MAX=10000

# External notification and mutation integrations stay disabled in the
# production-data test clone.
TELEGRAM_BOT_TOKEN=
APNS_KEY_ID=
APNS_TEAM_ID=
APNS_KEY_PATH=
APNS_PRODUCTION=false
FCM_PROJECT_ID=
FCM_PRIVATE_KEY=
FCM_CLIENT_EMAIL=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=eu-central-1
AWS_S3_BUCKET=bandeja-padel-eu
AWS_CLOUDFRONT_DOMAIN=d1afylun4w6qxe.cloudfront.net
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
RESULTS_ARTIFACTS_ENABLED=false
REPLICATE_API_TOKEN=
REPLICATE_WEBHOOK_URL=
REPLICATE_WEBHOOK_SECRET=
REDIS_URL=
ADS_REDIS_CACHE=false
STORY_SKIP_S3_MEDIA_CHECK=1
CHAT_SYNC_EVENT_RETENTION_DAYS=0
CHAT_MUTATION_IDEM_RETENTION_DAYS=0
ENV

if [[ -f "$CONFIG_DIR/oauth.env" ]]; then
  cat "$CONFIG_DIR/oauth.env" >> "$BACKEND_ENV_TMP"
fi
mv "$BACKEND_ENV_TMP" "$BACKEND/.env"
chmod 0600 "$BACKEND/.env"
umask 022

dependency_hash() {
  local directory="$1"
  (
    cd "$directory"
    if [[ -f package-lock.json ]]; then
      sha256sum package.json package-lock.json
    else
      sha256sum package.json
    fi
  ) | sha256sum | awk '{print $1}'
}

install_dependencies() {
  local key="$1"
  local directory="$2"
  local mode="$3"
  local marker="$CONFIG_DIR/deps-${key}.sha256"
  local wanted current=""

  wanted="$(dependency_hash "$directory")"
  [[ -f "$marker" ]] && current="$(<"$marker")"

  if [[ -d "$directory/node_modules" && "$current" == "$wanted" ]]; then
    echo "→ dependencies unchanged: $key"
    return
  fi

  echo "→ installing dependencies: $key"
  if [[ "$mode" == "ci" ]]; then
    npm ci --no-audit --no-fund --prefix "$directory"
  else
    npm install --no-audit --no-fund --prefix "$directory"
  fi
  printf '%s\n' "$wanted" > "$marker"
}

install_dependencies chat-contract "$SOURCE/packages/chat-contract" ci
install_dependencies unread-contract "$SOURCE/packages/unread-contract" install
install_dependencies shared "$SOURCE/Frontend/shared" ci
install_dependencies backend "$BACKEND" ci
install_dependencies frontend "$FRONTEND" ci

echo "→ generating Prisma client and applying test-database migrations"
(
  cd "$BACKEND"
  npx prisma generate
  npx prisma migrate deploy
)

echo "→ building shared packages"
npm run build --prefix "$SOURCE/packages/chat-contract"
npm run build --prefix "$SOURCE/packages/unread-contract"
npm run build --prefix "$SOURCE/Frontend/shared"

build_backend() {
  echo "→ building backend"
  npm_config_ignore_scripts=true npm run build --prefix "$BACKEND"
}

build_frontend() {
  echo "→ building frontend for https://$TEST_HOST"
  cd "$FRONTEND"
  if [[ -f build-env.sh ]]; then
    set -a
    # shellcheck source=/dev/null
    . ./build-env.sh
    set +a
  fi
  export VITE_API_BASE_URL="https://${TEST_HOST}/api"
  export VITE_MEDIA_BASE_URL="https://${TEST_HOST}"
  export VITE_WEB_BASE_URL="https://${TEST_HOST}"
  export VITE_SOCKET_URL="https://${TEST_HOST}"
  export VITE_DEPLOYMENT_ENV="staging"
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
  npm_config_ignore_scripts=true npm run build:staging
  node scripts/force-sw-update.js
}

build_backend &
BACKEND_BUILD_PID=$!
build_frontend &
FRONTEND_BUILD_PID=$!

BUILD_FAILED=0
wait "$BACKEND_BUILD_PID" || BUILD_FAILED=1
wait "$FRONTEND_BUILD_PID" || BUILD_FAILED=1
if [[ "$BUILD_FAILED" -ne 0 ]]; then
  echo "Backend or frontend build failed" >&2
  exit 1
fi

RID="$(date -u +%Y%m%d-%H%M%S)"
RELEASE="$RELEASES/$RID"
mkdir -p "$RELEASES"
mv "$FRONTEND/dist" "$RELEASE"
chmod -R u=rwX,go=rX "$RELEASE"
ln -sfn "$RELEASE" "$TEST_ROOT/frontend-current.next"
mv -Tf "$TEST_ROOT/frontend-current.next" "$TEST_ROOT/frontend-current"

echo "→ restarting isolated backend"
if pm2 describe "$PM2_PROCESS" >/dev/null 2>&1; then
  pm2 restart "$PM2_PROCESS" --update-env
else
  pm2 start "$BACKEND/dist/server.js" \
    --name "$PM2_PROCESS" \
    --cwd "$BACKEND" \
    --time
fi
pm2 save

for attempt in {1..30}; do
  if curl -fsS "http://127.0.0.1:${TEST_BACKEND_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "Backend did not become healthy" >&2
    pm2 logs "$PM2_PROCESS" --lines 80 --nostream >&2 || true
    exit 1
  fi
  sleep 1
done

NGINX_FRONTEND_HTML="$(
  curl -fsS --resolve "$TEST_HOST:443:127.0.0.1" "https://$TEST_HOST/" 2>/dev/null \
    || curl -fsS -H "Host: $TEST_HOST" http://127.0.0.1/
)"
if ! grep -Fq '<div id="root"></div>' <<<"$NGINX_FRONTEND_HTML"; then
  echo "nginx did not serve the newly activated frontend" >&2
  exit 1
fi

{
  printf 'revision=%s\n' "$DEPLOY_REVISION"
  printf 'dirty=%s\n' "$DEPLOY_DIRTY"
  printf 'deployed_at=%s\n' "$(date -u +%FT%TZ)"
  printf 'frontend_release=%s\n' "$RID"
} > "$TEST_ROOT/deployment.txt"

mapfile -t OLD_RELEASES < <(
  find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r
)
if ((${#OLD_RELEASES[@]} > 5)); then
  for old_release in "${OLD_RELEASES[@]:5}"; do
    if [[ "$old_release" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
      rm -rf "$RELEASES/$old_release"
    fi
  done
fi

echo "Deployment complete: revision=$DEPLOY_REVISION dirty=$DEPLOY_DIRTY release=$RID"
curl -fsS "http://127.0.0.1:${TEST_BACKEND_PORT}/health"
echo
