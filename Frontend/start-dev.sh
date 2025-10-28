#!/bin/bash

echo "🛑 Stopping any running frontend server on port 3001..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

echo "🚀 Starting frontend dev server..."
npm run dev

