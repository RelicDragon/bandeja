#!/bin/bash

cd "$(dirname "$0")"

echo "Building production frontend..."
npm run build

echo "Starting production server..."
npm run preview

