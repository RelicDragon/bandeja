#!/bin/bash

set -e

echo "🏓 Bandeja Backend - Dev Setup & Start"
echo "=========================================="

cd "$(dirname "$0")"

if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL first."
    echo "   macOS: brew install postgresql@16"
    exit 1
fi

if ! pg_isready -q; then
    echo "❌ PostgreSQL is not running. Starting PostgreSQL..."
    brew services start postgresql@16 || brew services start postgresql
    sleep 2
    
    if ! pg_isready -q; then
        echo "❌ Failed to start PostgreSQL. Please start it manually."
        exit 1
    fi
fi

echo "✅ PostgreSQL is running"

if [ ! -f .env ]; then
    echo "📝 Creating .env file from env.sample..."
    cp env.sample .env
    echo "✅ .env file created. Please update it with your configuration if needed."
else
    echo "✅ .env file already exists"
fi

source .env

DB_EXISTS=$(psql -U ${DB_USER} -lqt | cut -d \| -f 1 | grep -w ${DB_NAME} | wc -l)

if [ $DB_EXISTS -eq 0 ]; then
    echo "📦 Creating database '${DB_NAME}'..."
    createdb -U ${DB_USER} ${DB_NAME}
    echo "✅ Database created"
else
    echo "✅ Database '${DB_NAME}' already exists"
fi

echo "🔧 Creating schema '${DB_SCHEMA}' if it doesn't exist..."
psql -U ${DB_USER} -d ${DB_NAME} -c "CREATE SCHEMA IF NOT EXISTS ${DB_SCHEMA};" > /dev/null
echo "✅ Schema '${DB_SCHEMA}' ready"

if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed"
fi

echo "🔧 Generating Prisma Client..."
npm run prisma:generate

echo "🔄 Syncing database schema..."
npx prisma db push

echo ""
echo "✅ Setup complete! Starting dev server..."
echo ""

npm run dev

