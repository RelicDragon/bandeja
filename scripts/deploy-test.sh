#!/usr/bin/env bash
set -euo pipefail

# Deploy the current local working tree to the isolated web test environment.
#
# Routine code deploy:
#   ./scripts/deploy-test.sh
#
# Refresh the test DB from production, then deploy:
#   ./scripts/deploy-test.sh --refresh-db
#
# First-time server setup:
#   ./scripts/deploy-test.sh --provision --refresh-db
#
# Enable HTTPS after DNS resolves:
#   ./scripts/deploy-test.sh --tls

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_HOST="${TEST_HOST:-thisistestfor.bandeja.me}"
TEST_PUBLIC_IP="${TEST_PUBLIC_IP:-91.98.232.51}"
TEST_SSH_HOST="${TEST_SSH_HOST:-relic@front.bandeja.com}"
TEST_ROOT_SSH_HOST="${TEST_ROOT_SSH_HOST:-root@front.bandeja.com}"
PROD_BACKEND_SSH_HOST="${PROD_BACKEND_SSH_HOST:-relic@back.bandeja.com}"
TEST_SSH_KEY="${TEST_SSH_KEY:-$HOME/.ssh/id_hetzner}"
TEST_ROOT="/home/relic/bandeja-test"
TEST_DB_NAME="padelpulse_test"
TEST_DB_ROLE="padelpulse_test"
TEST_PM2_PROCESS="bandeja-test-backend"

DO_PROVISION=0
DO_REFRESH_DB=0
DO_TLS=0

usage() {
  cat <<'USAGE'
usage: ./scripts/deploy-test.sh [--provision] [--refresh-db] [--tls]

  no flags       Sync and deploy the current local working tree
  --provision    Idempotently provision PostgreSQL, paths, secrets, and nginx
  --refresh-db   Replace only the test database with a fresh production clone
  --tls          Obtain/renew the test-host certificate after DNS resolves
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --provision) DO_PROVISION=1 ;;
    --refresh-db) DO_REFRESH_DB=1 ;;
    --tls) DO_TLS=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$TEST_SSH_KEY" ]]; then
  echo "SSH key not found: $TEST_SSH_KEY" >&2
  exit 1
fi
if [[ ! "$TEST_HOST" =~ ^[a-z0-9.-]+$ ]]; then
  echo "Invalid test hostname: $TEST_HOST" >&2
  exit 1
fi

SESSION_DIR="$(mktemp -d /tmp/bandeja-test-deploy.XXXXXX)"
CONTROL_PATH="$SESSION_DIR/ssh-%C"

ssh_args=(
  -o IdentitiesOnly=yes
  -o IdentityFile="$TEST_SSH_KEY"
  -o AddressFamily=inet
  -o StrictHostKeyChecking=accept-new
  -o ConnectTimeout=20
  -o ServerAliveInterval=60
  -o ServerAliveCountMax=3
  -o ControlMaster=auto
  -o ControlPersist=120
  -o ControlPath="$CONTROL_PATH"
)

cleanup() {
  ssh "${ssh_args[@]}" -O exit "$TEST_SSH_HOST" >/dev/null 2>&1 || true
  ssh "${ssh_args[@]}" -O exit "$TEST_ROOT_SSH_HOST" >/dev/null 2>&1 || true
  ssh "${ssh_args[@]}" -O exit "$PROD_BACKEND_SSH_HOST" >/dev/null 2>&1 || true
  rm -rf "$SESSION_DIR"
}
trap cleanup EXIT

run_ssh() {
  local host="$1"
  shift
  ssh "${ssh_args[@]}" "$host" "$@"
}

sync_oauth_config() {
  echo "→ copying only OAuth/Fallback-City configuration from production"
  run_ssh "$PROD_BACKEND_SSH_HOST" \
    "sed -nE '/^(GOOGLE_WEB_CLIENT_ID|GOOGLE_IOS_CLIENT_ID|GOOGLE_ANDROID_CLIENT_ID|GOOGLE_CLIENT_SECRET|FALLBACK_CITY_ID)=/p' ~/src/Backend/.env" \
    | run_ssh "$TEST_ROOT_SSH_HOST" \
      "umask 077; install -d -m 0755 -o relic -g relic '$TEST_ROOT/config'; cat > '$TEST_ROOT/config/oauth.env'; chown relic:relic '$TEST_ROOT/config/oauth.env'; chmod 0600 '$TEST_ROOT/config/oauth.env'"
}

provision() {
  echo "→ provisioning isolated test runtime on $TEST_ROOT_SSH_HOST"
  run_ssh "$TEST_ROOT_SSH_HOST" \
    "bash -s -- '$TEST_HOST' '$TEST_ROOT'" \
    < "$REPO_ROOT/scripts/test-env/provision-remote.sh"
  sync_oauth_config
}

refresh_database() {
  echo "→ stopping only the test backend for database refresh"
  run_ssh "$TEST_SSH_HOST" \
    "export NVM_DIR=\"\$HOME/.nvm\"; [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"; pm2 stop '$TEST_PM2_PROCESS' >/dev/null 2>&1 || true"

  echo "→ recreating isolated database $TEST_DB_NAME"
  run_ssh "$TEST_ROOT_SSH_HOST" \
    "runuser -u postgres -- dropdb --force --if-exists '$TEST_DB_NAME'; runuser -u postgres -- createdb --owner='$TEST_DB_ROLE' '$TEST_DB_NAME'"

  echo "→ streaming current production dataset into the isolated database"
  run_ssh "$PROD_BACKEND_SSH_HOST" \
    "set -eu; cd ~/src/Backend; set -a; . ./.env; set +a; DB_CONNECT=\"\${DB_URL%%\\?*}\"; pg_dump --format=custom --compress=6 --no-owner --no-acl \"\$DB_CONNECT\"" \
    | run_ssh "$TEST_ROOT_SSH_HOST" \
      "runuser -u postgres -- pg_restore --exit-on-error --no-owner --no-acl --role='$TEST_DB_ROLE' --dbname='$TEST_DB_NAME'"

  CLONED_USERS="$(
    run_ssh "$TEST_ROOT_SSH_HOST" \
      "runuser -u postgres -- psql -d '$TEST_DB_NAME' -Atqc 'SELECT count(*) FROM padelpulse.\"User\"'"
  )"
  echo "→ production clone restored ($CLONED_USERS users)"
}

sync_source() {
  echo "→ syncing current local working tree to $TEST_SSH_HOST:$TEST_ROOT/source"
  run_ssh "$TEST_SSH_HOST" "mkdir -p '$TEST_ROOT/source'"

  rsync -az --delete --delete-delay \
    -e "ssh -o IdentitiesOnly=yes -o IdentityFile=$TEST_SSH_KEY -o AddressFamily=inet -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -o ControlMaster=auto -o ControlPersist=120 -o ControlPath=$CONTROL_PATH" \
    --exclude '/.git/' \
    --exclude '/.idea/' \
    --exclude '/.vscode/' \
    --exclude '/.cursor/' \
    --exclude '/.codex/' \
    --exclude '/.agents/' \
    --exclude '/.app-release/' \
    --exclude '/tmp/' \
    --exclude '/6/' \
    --exclude '/Gamify_old/' \
    --exclude '/shared/dr5hn-data/' \
    --exclude '**/node_modules/' \
    --exclude '**/dist/' \
    --exclude '**/releases/' \
    --exclude '**/.env' \
    --exclude '**/.env.*' \
    --exclude '/Backend/uploads/' \
    --exclude '/Backend/public/uploads/' \
    --exclude '/Backend/additions/' \
    --exclude '/Frontend/android/' \
    --exclude '/Frontend/ios/' \
    --exclude '/Frontend/coverage/' \
    --exclude '/Frontend/playwright-report/' \
    --exclude '/Frontend/test-results/' \
    --exclude '*.log' \
    "$REPO_ROOT/" "$TEST_SSH_HOST:$TEST_ROOT/source/"
}

deploy_source() {
  local revision dirty
  revision="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  if git -C "$REPO_ROOT" diff --quiet --ignore-submodules HEAD -- 2>/dev/null \
    && [[ -z "$(git -C "$REPO_ROOT" ls-files --others --exclude-standard)" ]]; then
    dirty="no"
  else
    dirty="yes"
  fi

  echo "→ building and activating revision $revision (dirty=$dirty)"
  run_ssh "$TEST_SSH_HOST" \
    "TEST_HOST='$TEST_HOST' TEST_ROOT='$TEST_ROOT' DEPLOY_REVISION='$revision' DEPLOY_DIRTY='$dirty' bash '$TEST_ROOT/source/scripts/test-env/deploy-remote.sh'"
}

enable_tls() {
  echo "→ obtaining TLS certificate and enabling HTTPS for $TEST_HOST"
  run_ssh "$TEST_ROOT_SSH_HOST" \
    "bash -s -- '$TEST_HOST' '$TEST_ROOT' '$TEST_PUBLIC_IP'" \
    < "$REPO_ROOT/scripts/test-env/enable-tls-remote.sh"
}

if [[ "$DO_PROVISION" -eq 1 ]]; then
  provision
fi

if [[ "$DO_REFRESH_DB" -eq 1 ]]; then
  refresh_database
fi

sync_source
deploy_source

if [[ "$DO_TLS" -eq 1 ]]; then
  enable_tls
fi

echo "→ checking nginx route on the server"
TLS_ENABLED=0
if run_ssh "$TEST_ROOT_SSH_HOST" \
  "test -f '/etc/letsencrypt/live/$TEST_HOST/fullchain.pem'"; then
  TLS_ENABLED=1
  run_ssh "$TEST_ROOT_SSH_HOST" \
    "curl -fsS --resolve '$TEST_HOST:443:127.0.0.1' 'https://$TEST_HOST/' | grep -Fq '<div id=\"root\"></div>'; curl -fsS --resolve '$TEST_HOST:443:127.0.0.1' 'https://$TEST_HOST/api/health'"
else
  run_ssh "$TEST_ROOT_SSH_HOST" \
    "curl -fsS -H 'Host: $TEST_HOST' http://127.0.0.1/ | grep -Fq '<div id=\"root\"></div>'; curl -fsS -H 'Host: $TEST_HOST' http://127.0.0.1/api/health"
fi
echo

if [[ "$TLS_ENABLED" -eq 1 ]]; then
  echo "→ checking public HTTPS"
  curl -fsS --max-time 20 \
    --resolve "$TEST_HOST:443:$TEST_PUBLIC_IP" \
    "https://$TEST_HOST/api/health"
  echo
fi

echo "Test environment ready: https://$TEST_HOST"
