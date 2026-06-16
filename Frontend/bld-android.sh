#!/bin/bash

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/build-env.sh"
source "$SCRIPT_DIR/scripts/verify-capacitor-bundle.sh"

if [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ]]; then
	export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
fi

echo "🔨 Building Capacitor app..."

echo "📦 Building frontend..."
npm run build
verify_capacitor_bundle

echo "📲 Syncing with Capacitor..."
npx cap sync android

npx cap open android
