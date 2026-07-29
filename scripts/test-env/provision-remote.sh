#!/usr/bin/env bash
set -euo pipefail

# Runs as root on the frontend server. It is intentionally idempotent.

TEST_HOST="${1:-thisistestfor.bandeja.me}"
TEST_ROOT="${2:-/home/relic/bandeja-test}"
TEST_USER="relic"
TEST_DB_NAME="padelpulse_test"
TEST_DB_ROLE="padelpulse_test"
TEST_BACKEND_PORT="3100"
EXPECTED_PG_MAJOR="18"

if [[ ! "$TEST_HOST" =~ ^[a-z0-9.-]+$ ]]; then
  echo "Invalid test hostname: $TEST_HOST" >&2
  exit 1
fi

if [[ "$TEST_ROOT" != "/home/relic/bandeja-test" ]]; then
  echo "Refusing unexpected test root: $TEST_ROOT" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "provision-remote.sh must run as root" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

ensure_postgres_18() {
  if command -v psql >/dev/null 2>&1 && psql --version | grep -q "PostgreSQL) ${EXPECTED_PG_MAJOR}\\."; then
    return
  fi

  apt-get update
  apt-get install -y curl ca-certificates postgresql-common
  install -d -m 0755 /usr/share/postgresql-common/pgdg
  curl -fsS \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc
  cat > /etc/apt/sources.list.d/pgdg.sources <<'PGDG'
Types: deb
URIs: https://apt.postgresql.org/pub/repos/apt
Suites: noble-pgdg
Architectures: amd64
Components: main
Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
PGDG
  apt-get update
  apt-get install -y postgresql-18 postgresql-client-18
}

ensure_runtime_tools() {
  local missing=()
  command -v nginx >/dev/null 2>&1 || missing+=(nginx)
  command -v certbot >/dev/null 2>&1 || missing+=(certbot python3-certbot-nginx)
  command -v rsync >/dev/null 2>&1 || missing+=(rsync)
  command -v curl >/dev/null 2>&1 || missing+=(curl)

  if ((${#missing[@]} > 0)); then
    apt-get update
    apt-get install -y "${missing[@]}"
  fi
}

ensure_postgres_18
ensure_runtime_tools
systemctl enable --now postgresql nginx

install -d -m 0755 -o "$TEST_USER" -g "$TEST_USER" \
  "$TEST_ROOT" \
  "$TEST_ROOT/config" \
  "$TEST_ROOT/source" \
  "$TEST_ROOT/frontend-releases"
install -d -m 0755 /var/www/letsencrypt

GENERATED_ENV="$TEST_ROOT/config/generated.env"
if [[ ! -f "$GENERATED_ENV" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 48)"
  umask 077
  {
    printf 'TEST_DB_PASSWORD=%s\n' "$DB_PASSWORD"
    printf 'TEST_JWT_SECRET=%s\n' "$JWT_SECRET"
  } > "$GENERATED_ENV"
  chown "$TEST_USER:$TEST_USER" "$GENERATED_ENV"
fi

# This file is generated locally on this host and only contains hex values.
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

if ! runuser -u postgres -- psql -Atqc \
  "SELECT 1 FROM pg_roles WHERE rolname = '${TEST_DB_ROLE}'" | grep -q 1; then
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c \
    "CREATE ROLE ${TEST_DB_ROLE} LOGIN PASSWORD '${TEST_DB_PASSWORD}'"
else
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c \
    "ALTER ROLE ${TEST_DB_ROLE} WITH LOGIN PASSWORD '${TEST_DB_PASSWORD}'"
fi

if ! runuser -u postgres -- psql -Atqc \
  "SELECT 1 FROM pg_database WHERE datname = '${TEST_DB_NAME}'" | grep -q 1; then
  runuser -u postgres -- createdb --owner="$TEST_DB_ROLE" "$TEST_DB_NAME"
fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c \
  "ALTER DATABASE ${TEST_DB_NAME} OWNER TO ${TEST_DB_ROLE}"

NGINX_AVAILABLE="/etc/nginx/sites-available/bandeja-test.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/bandeja-test.conf"

if [[ -f "/etc/letsencrypt/live/${TEST_HOST}/fullchain.pem" && -f "$NGINX_AVAILABLE" ]]; then
  echo "Existing TLS nginx configuration preserved"
  nginx -t
  systemctl reload nginx
  echo "Test host provisioned: $TEST_HOST"
  echo "PostgreSQL: $(psql --version)"
  echo "Database: $TEST_DB_NAME (local only)"
  exit 0
fi

cat > "$NGINX_AVAILABLE" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${TEST_HOST};

  root ${TEST_ROOT}/frontend-current;
  index index.html;

  access_log /var/log/nginx/bandeja-test-access.log;
  error_log /var/log/nginx/bandeja-test-error.log;

  add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;

  location ^~ /.well-known/acme-challenge/ {
    root /var/www/letsencrypt;
    default_type text/plain;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:${TEST_BACKEND_PORT}/api/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Port \$server_port;
    client_max_body_size 10m;
    proxy_read_timeout 60s;
    proxy_connect_timeout 5s;
    proxy_send_timeout 60s;
  }

  location ^~ /uploads/ {
    proxy_pass http://127.0.0.1:${TEST_BACKEND_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    client_max_body_size 10m;
  }

  location /socket.io/ {
    proxy_pass http://127.0.0.1:${TEST_BACKEND_PORT}/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 86400;
    proxy_buffering off;
  }

  location = /sw.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    try_files \$uri =404;
  }

  location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot|json|glb|fbx)\$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    try_files \$uri =404;
  }

  location / {
    try_files \$uri \$uri/ /index.html;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
  }
}
NGINX

ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"
nginx -t
systemctl reload nginx

echo "Test host provisioned: $TEST_HOST"
echo "PostgreSQL: $(psql --version)"
echo "Database: $TEST_DB_NAME (local only)"
