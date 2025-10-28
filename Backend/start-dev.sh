#!/bin/bash

echo "🛑 Stopping any running backend server on port 3000..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

echo "🚀 Starting backend dev server..."
npm run dev

