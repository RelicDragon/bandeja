#!/bin/bash
# Sync PostgreSQL database from production to development
# 
# Usage:
#   ./sync-db-from-prod.sh
#
# The script will:
#   1. Use ssh-agent to cache SSH key passphrase (only asks once)
#   2. Connect to prod server and dump DATA ONLY (no schema changes)
#   3. Transfer data dump to dev and restore it
#   4. Preserves schema structure to prevent Prisma migration drift

set -e

SSH_HOST="relic@back.bandeja.com"
SSH_KEY="/Users/relic/.ssh/id_hetzner"
SSH_CMD="ssh -i ${SSH_KEY} ${SSH_HOST}"

cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create it from env.sample"
    exit 1
fi

source .env

DEV_DB_HOST="${DB_HOST}"
DEV_DB_PORT="${DB_PORT}"
DEV_DB_NAME="${DB_NAME}"
DEV_DB_USER="${DB_USER}"
DEV_DB_PASSWORD="${DB_PASSWORD}"
DEV_DB_SCHEMA="${DB_SCHEMA:-public}"

if [ -z "${DEV_DB_HOST}" ] || [ -z "${DEV_DB_PORT}" ] || [ -z "${DEV_DB_NAME}" ] || [ -z "${DEV_DB_USER}" ] || [ -z "${DEV_DB_PASSWORD}" ]; then
    echo "❌ Missing required database configuration in .env file"
    echo "   Required: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD"
    exit 1
fi

DUMP_FILE="/tmp/padelpulse_prod_dump_$(date +%Y%m%d_%H%M%S).sql"
TELEGRAM_CHANNELS_FILE="/tmp/padelpulse_telegram_channels_$(date +%Y%m%d_%H%M%S).sql"

echo "🔄 Starting data-only sync from production to development..."

echo "💾 Saving current telegramChannelId values from city table..."
PGPASSWORD="${DEV_DB_PASSWORD}" psql -h "${DEV_DB_HOST}" -p "${DEV_DB_PORT}" -U "${DEV_DB_USER}" -d "${DEV_DB_NAME}" -t -c "SELECT id, \"telegramChannelId\" FROM ${DEV_DB_SCHEMA}.city WHERE \"telegramChannelId\" IS NOT NULL;" > "${TELEGRAM_CHANNELS_FILE}" 2>/dev/null || true

if [ -z "$SSH_AUTH_SOCK" ]; then
    echo "🔑 Starting ssh-agent..."
    eval "$(ssh-agent -s)"
    trap "kill $SSH_AGENT_PID 2>/dev/null" EXIT
fi

echo "🔑 Adding SSH key (enter passphrase once if needed)..."
ssh-add "${SSH_KEY}" 2>&1 | grep -v "already in the agent" || true

echo "📦 Dumping DATA ONLY from production server (excluding Prisma migrations and schema changes)..."
${SSH_CMD} "cd /home/relic/src/Backend && source .env && if [ -z \"\${DB_HOST}\" ] || [ -z \"\${DB_PORT}\" ] || [ -z \"\${DB_NAME}\" ] || [ -z \"\${DB_USER}\" ] || [ -z \"\${DB_PASSWORD}\" ]; then echo '❌ Missing required database configuration in prod .env file'; exit 1; fi && PROD_SCHEMA=\"\${DB_SCHEMA:-public}\" && PGPASSWORD=\"\${DB_PASSWORD}\" pg_dump -h \${DB_HOST} -p \${DB_PORT} -U \${DB_USER} -d \${DB_NAME} --data-only --no-owner --no-acl --disable-triggers --exclude-table=\${PROD_SCHEMA}._prisma_migrations" > "${DUMP_FILE}"

if [ ! -s "${DUMP_FILE}" ]; then
    echo "❌ Database dump failed or is empty"
    exit 1
fi

echo "✅ Data dump created: ${DUMP_FILE}"

echo "🗑️  Clearing existing data from dev database (preserving schema)..."
TRUNCATE_FILE="/tmp/padelpulse_truncate_$(date +%Y%m%d_%H%M%S).sql"
PGPASSWORD="${DEV_DB_PASSWORD}" psql -h "${DEV_DB_HOST}" -p "${DEV_DB_PORT}" -U "${DEV_DB_USER}" -d "${DEV_DB_NAME}" -t -c "SELECT 'TRUNCATE TABLE ' || schemaname || '.' || tablename || ' CASCADE;' FROM pg_tables WHERE schemaname = '${DEV_DB_SCHEMA}' AND tablename != '_prisma_migrations';" | grep -v '^$' > "${TRUNCATE_FILE}" || true

if [ -s "${TRUNCATE_FILE}" ]; then
    PGPASSWORD="${DEV_DB_PASSWORD}" psql -h "${DEV_DB_HOST}" -p "${DEV_DB_PORT}" -U "${DEV_DB_USER}" -d "${DEV_DB_NAME}" -f "${TRUNCATE_FILE}" > /dev/null 2>&1 || true
    rm -f "${TRUNCATE_FILE}"
fi

echo "📥 Restoring data dump to dev server (disabling triggers to handle foreign keys)..."
RESTORE_FILE="/tmp/padelpulse_restore_$(date +%Y%m%d_%H%M%S).sql"
echo "SET session_replication_role = 'replica';" > "${RESTORE_FILE}"
cat "${DUMP_FILE}" >> "${RESTORE_FILE}"
echo "SET session_replication_role = 'origin';" >> "${RESTORE_FILE}"
PGPASSWORD="${DEV_DB_PASSWORD}" psql -h "${DEV_DB_HOST}" -p "${DEV_DB_PORT}" -U "${DEV_DB_USER}" -d "${DEV_DB_NAME}" -f "${RESTORE_FILE}" || true
rm -f "${RESTORE_FILE}"

echo "🔒 Restoring telegramChannelId values to city table..."
if [ -s "${TELEGRAM_CHANNELS_FILE}" ]; then
    while IFS='|' read -r city_id telegram_channel_id; do
        city_id=$(echo "$city_id" | xargs | tr -d ' ')
        telegram_channel_id=$(echo "$telegram_channel_id" | xargs)
        if [ -n "$city_id" ] && [ -n "$telegram_channel_id" ]; then
            escaped_channel_id=$(echo "${telegram_channel_id}" | sed "s/'/''/g")
            PGPASSWORD="${DEV_DB_PASSWORD}" psql -h "${DEV_DB_HOST}" -p "${DEV_DB_PORT}" -U "${DEV_DB_USER}" -d "${DEV_DB_NAME}" -c "UPDATE ${DEV_DB_SCHEMA}.city SET \"telegramChannelId\" = '${escaped_channel_id}' WHERE id = ${city_id};" > /dev/null 2>&1 || true
        fi
    done < "${TELEGRAM_CHANNELS_FILE}"
fi

echo "🧹 Cleaning up dump files..."
rm -f "${DUMP_FILE}" "${TELEGRAM_CHANNELS_FILE}"

echo "✅ Data sync completed successfully! (Schema structure preserved)"
