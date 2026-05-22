/**
 * Post–Wave 2 multisport depth — orchestrator (P-W3-TIMED, …)
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

function runSuite(label: string, scriptName: string, dotenv = true): void {
  const script = join(__dirname, scriptName);
  assert(existsSync(script), `${scriptName} exists`);
  const args = dotenv ? ['-r', 'dotenv/config', tsNode, script] : [tsNode, script];
  const r = spawnSync(process.execPath, args, {
    cwd: backendRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if ((r.status ?? 1) !== 0) {
    console.error(`FAIL: ${label}`);
    process.exit(r.status ?? 1);
  }
}

function main(): void {
  runSuite('P-W3 invite copy', 'multisport-post-wave2-invite.ts', false);
  runSuite('post-wave2 timed/custom', 'multisport-post-wave2-timed.ts');
  console.log('multisport-post-wave2: orchestrator passed');
}

main();
