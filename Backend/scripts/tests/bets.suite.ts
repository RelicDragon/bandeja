#!/usr/bin/env ts-node
/**
 * Bets automated suite: resolution retry, routing, evaluator, pool distribution, payout.
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

  run('bet resolution retry orchestration', 'src/services/bets/betResolutionRetry.test.ts', true);
  run('bet resolution routing', 'src/services/bets/betResolution.test.ts');
  run('bet condition evaluator', 'src/services/bets/betConditionEvaluator.test.ts');
  run('pool coin distribution', 'src/services/bets/poolCoinDistribution.test.ts');
  run('bet resolution payout', 'src/services/bets/betResolutionPayout.test.ts', true);
  run('accept bet guards', 'src/services/bets/bet.service.acceptBet.test.ts', true);
  run('cancel bet guards', 'src/services/bets/bet.service.cancel.test.ts', true);

  console.log('bets.suite: all checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
