#!/bin/bash

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/build-env.sh"

echo "🔨 Building Capacitor app..."

# Build the frontend
echo "📦 Building frontend..."
npm run build

# Copy to Capacitor
echo "📲 Syncing with Capacitor..."
npx cap sync

npx cap open ios

