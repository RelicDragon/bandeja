#!/usr/bin/env ts-node
/**
 * Ads automated suite: unit (targeting, pick, cap, locale, Phase B) + integration (events).
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/ads.suite.ts
 */

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

const backendRoot = path.resolve(__dirname, '..', '..');

function run(label: string, relPath: string, needsDb = false): void {
  const scriptPath = path.join(backendRoot, relPath);
  const args = needsDb
    ? ['-r', 'dotenv/config', path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'), scriptPath]
    : [path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'), scriptPath];

  const result = spawnSync(process.execPath, args, {
    cwd: backendRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(`FAIL: ${label}`);
    process.exit(result.status ?? 1);
  }
  console.log(`ok: ${label}`);
}

async function main() {
  dotenv.config({ path: path.join(backendRoot, '.env') });

  run(
    'targeting + priority pick + cap + locale + Phase B filters + variant pick',
    'src/services/ads/ad.delivery.test.ts'
  );
  run('event idempotency + impression increments + targeting filter', 'scripts/tests/ads.ts', true);

  console.log('ads.suite: all checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
