#!/bin/bash

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/build-env.sh"
source "$SCRIPT_DIR/scripts/fix-ios-pbx-object-version.sh"

echo "🔨 Building Capacitor app..."

# Build the frontend
echo "📦 Building frontend..."
npm run build

# Copy to Capacitor
echo "📲 Syncing with Capacitor..."
fix_ios_pbx_object_version
npx cap sync
fix_ios_pbx_object_version
( cd "$SCRIPT_DIR/ios/App" && pod install )

npx cap open ios
npx cap open android
