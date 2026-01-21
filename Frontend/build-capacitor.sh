#!/bin/bash

set -e

echo "🔨 Building Capacitor app..."

# Override environment variables for Capacitor build
export VITE_TELEGRAM_BOT_URL=https://t.me/bandeja_padel_bot
export VITE_MEDIA_BASE_URL=https://bandeja.me
export VITE_GOOGLE_IOS_CLIENT_ID=29841261894-9eu73ns39ee4qvs7d82rsgtoasoc3gq5.apps.googleusercontent.com
export VITE_GOOGLE_ANDROID_CLIENT_ID=29841261894-ai785ut6sde9e5k4ol3mnhe1ajkf9r07.apps.googleusercontent.com
export VITE_GOOGLE_WEB_CLIENT_ID=29841261894-3kb5f69ntct66j52nmfvm2j2jpvpdvfb.apps.googleusercontent.com

# Build the frontend
echo "📦 Building frontend..."
npm run build

# Copy to Capacitor
echo "📲 Syncing with Capacitor..."
npx cap sync

npx cap open ios
npx cap open android
