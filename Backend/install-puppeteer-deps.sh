#!/bin/bash

set -e

echo "🔧 Installing Puppeteer system dependencies for Ubuntu..."

sudo apt-get update

sudo apt-get install -y \
  libnspr4 \
  libnss3 \
  libatk1.0-0t64 \
  libatk-bridge2.0-0t64 \
  libcups2t64 \
  libdrm2 \
  libdbus-1-3 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2t64 \
  libpangocairo-1.0-0 \
  libcairo-gobject2 \
  libgtk-3-0t64 \
  libgdk-pixbuf2.0-0

echo "✅ Puppeteer dependencies installed successfully!"
