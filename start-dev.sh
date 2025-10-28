#!/bin/bash

echo "🛑 Stopping any running servers..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

echo "🚀 Starting both servers..."

cd Backend
npm run dev &
BACKEND_PID=$!

cd ../Frontend
npm run dev &
FRONTEND_PID=$!

cd ..

echo "✅ Backend started (PID: $BACKEND_PID) on port 3000"
echo "✅ Frontend started (PID: $FRONTEND_PID) on port 3001"
echo ""
echo "Press Ctrl+C to stop both servers"

trap "echo '🛑 Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

wait

