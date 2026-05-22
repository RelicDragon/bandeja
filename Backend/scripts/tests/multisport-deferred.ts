/**
 * Multisport deferred backlog — D-QA orchestrator
 *
 * Covers: BE/FE registry parity, Watch default audit (skip until D-P0-WATCH),
 * D-P3-PRODUCT (lastCreatedSport, sportsPlayed), pickleball POINTS/TIMED validators.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..', '..');
const tsNode = join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function runSuite(label: string, scriptName: string, dotenv = false): void {
  const script = join(__dirname, scriptName);
  assert(existsSync(script), `${scriptName} exists`);
  const args = dotenv ? ['-r', 'dotenv/config', tsNode, script] : [tsNode, script];
  const r = spawnSync(process.execPath, args, { cwd: backendRoot, stdio: 'inherit', env: process.env });
  if ((r.status ?? 1) !== 0) {
    console.error(`FAIL: ${label}`);
    process.exit(r.status ?? 1);
  }
}

function main(): void {
  runSuite('deferred registry', 'multisport-deferred-registry.ts');
  runSuite('deferred watch', 'multisport-deferred-watch.ts');
  runSuite('deferred pickleball', 'multisport-deferred-pickleball.ts');
  runSuite('deferred product', 'multisport-deferred-product.ts', true);
  runSuite('P-W3-WATCH', 'multisport-post-wave2-watch.ts');
  console.log('multisport-deferred: orchestrator passed');
}

main();
