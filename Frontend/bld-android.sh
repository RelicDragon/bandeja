#!/bin/bash

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/build-env.sh"
source "$SCRIPT_DIR/scripts/verify-capacitor-bundle.sh"

echo "🔨 Building Capacitor app..."

echo "📦 Building frontend..."
npm run build
verify_capacitor_bundle

echo "📲 Syncing with Capacitor..."
npx cap sync

npx cap open android
