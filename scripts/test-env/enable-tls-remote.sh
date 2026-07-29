#!/usr/bin/env bash
set -euo pipefail

# Runs as root after DNS points the test hostname at this frontend server.

TEST_HOST="${1:-thisistestfor.bandeja.me}"
TEST_ROOT="${2:-/home/relic/bandeja-test}"
EXPECTED_IP="${3:-91.98.232.51}"
TEST_BACKEND_PORT="3100"

if [[ ! "$TEST_HOST" =~ ^[a-z0-9.-]+$ ]]; then
  echo "Invalid test hostname: $TEST_HOST" >&2
  exit 1
fi
if [[ "$TEST_ROOT" != "/home/relic/bandeja-test" ]]; then
  echo "Refusing unexpected test root: $TEST_ROOT" >&2
  exit 1
fi
if [[ "$(id -u)" -ne 0 ]]; then
  echo "enable-tls-remote.sh must run as root" >&2
  exit 1
fi

RESOLVED_IPS="$(getent ahostsv4 "$TEST_HOST" | awk '{print $1}' | sort -u)"
if ! grep -qx "$EXPECTED_IP" <<<"$RESOLVED_IPS"; then
  echo "$TEST_HOST does not resolve to $EXPECTED_IP yet" >&2
  echo "Resolved IPv4 addresses: ${RESOLVED_IPS:-none}" >&2
  exit 1
fi

certbot certonly \
  --webroot \
  --webroot-path /var/www/letsencrypt \
  --domain "$TEST_HOST" \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  --keep-until-expiring

NGINX_AVAILABLE="/etc/nginx/sites-available/bandeja-test.conf"

cat > "$NGINX_AVAILABLE" <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${TEST_HOST};

  location ^~ /.well-known/acme-challenge/ {
    root /var/www/letsencrypt;
    default_type text/plain;
  }

  location / {
    return 301 https://\$host\$request_uri;
  }
}

server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name ${TEST_HOST};

  ssl_certificate /etc/letsencrypt/live/${TEST_HOST}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${TEST_HOST}/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

  root ${TEST_ROOT}/frontend-current;
  index index.html;

  access_log /var/log/nginx/bandeja-test-access.log;
  error_log /var/log/nginx/bandeja-test-error.log;

  gzip on;
  gzip_vary on;
  gzip_min_length 1024;
  gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml;

  add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;

  location /api/ {
    proxy_pass http://127.0.0.1:${TEST_BACKEND_PORT}/api/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_set_header X-Forwarded-Port \$server_port;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
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
    proxy_read_timeout 60s;
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
    add_header Pragma "no-cache" always;
    add_header Expires "0" always;
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
    add_header Pragma "no-cache";
    add_header Expires "0";
    add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
  }
}
NGINX

nginx -t
systemctl reload nginx
certbot certificates
