#!/bin/bash

set -e

echo "🔨 Building Capacitor app..."

# Override environment variables for Capacitor build
export VITE_TELEGRAM_BOT_URL=https://t.me/bandeja_padel_bot
export VITE_MEDIA_BASE_URL=https://bandeja.me

# Build the frontend
echo "📦 Building frontend..."
npm run build

# Copy to Capacitor
echo "📲 Syncing with Capacitor..."
npx cap sync

npx cap open ios
npx cap open android
