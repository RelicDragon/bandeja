#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const required = [
  'dist/server.js',
  'dist/routes/user.routes.js',
  'dist/routes/index.js',
];

const forbidden = ['dist/Backend/src/server.js'];

for (const rel of required) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error(`build layout error: missing ${rel} (run npm run build from Backend/ with repo root present)`);
    process.exit(1);
  }
}

for (const rel of forbidden) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) {
    console.error(
      `build layout error: stale nested output ${rel} — remove dist/ and fix tsconfig (rootDir must be ./src, do not include ../shared in include)`,
    );
    process.exit(1);
  }
}

const userRoutes = fs.readFileSync(path.join(root, 'dist/routes/user.routes.js'), 'utf8');
if (!userRoutes.includes("'/primary-sport/confirm'")) {
  console.error('build layout error: dist/routes/user.routes.js missing primary-sport/confirm route');
  process.exit(1);
}

console.log('dist layout ok');
