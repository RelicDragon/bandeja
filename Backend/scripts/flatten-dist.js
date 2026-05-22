#!/usr/bin/env node
/**
 * tsc emits Backend/src under dist/Backend/src when shared/ files are in the program.
 * npm start expects dist/server.js — flatten nested output after every build.
 */
const fs = require('fs');
const path = require('path');

const backendRoot = path.join(__dirname, '..');
const dist = path.join(backendRoot, 'dist');
const nested = path.join(dist, 'Backend', 'src');

if (!fs.existsSync(nested)) {
  return;
}

function moveDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.existsSync(to)) {
      fs.rmSync(to, { recursive: true, force: true });
    }
    fs.renameSync(from, to);
  }
}

moveDir(nested, dist);

const nestedBackend = path.join(dist, 'Backend');
if (fs.existsSync(nestedBackend)) {
  fs.rmSync(nestedBackend, { recursive: true, force: true });
}
const nestedFrontend = path.join(dist, 'Frontend');
if (fs.existsSync(nestedFrontend)) {
  fs.rmSync(nestedFrontend, { recursive: true, force: true });
}
const nestedShared = path.join(dist, 'shared');
if (fs.existsSync(nestedShared)) {
  fs.rmSync(nestedShared, { recursive: true, force: true });
}
