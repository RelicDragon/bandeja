#!/bin/bash

set -e

echo "🔨 Building Capacitor app..."

# Build the frontend
echo "📦 Building frontend..."
npm run build

# Copy to Capacitor
echo "📲 Syncing with Capacitor..."
npx cap sync

echo "✅ Build complete!"
echo ""
echo "📱 To run on iOS:"
echo "   npx cap open ios"
echo ""
echo "🤖 To run on Android:"
echo "   npx cap open android"

