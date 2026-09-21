import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function runDeploy(extraEnv = {}) {
  const fixture = mkdtempSync(join(tmpdir(), 'backend-deploy-test-'));
  try {
    const bin = join(fixture, 'bin');
    mkdirSync(bin);
    mkdirSync(join(fixture, 'Backend'));
    mkdirSync(join(fixture, 'scripts'));
    const lock = join(fixture, 'scripts/run-heavy');
    writeFileSync(lock, readFileSync(join(root, 'scripts/run-heavy')));
    chmodSync(lock, 0o755);
    const log = join(fixture, 'commands.jsonl');
    for (const command of ['npm', 'npx', 'pm2']) {
      const executable = join(bin, command);
      writeFileSync(executable, `#!/usr/bin/env node
const fs = require('node:fs');
const v8 = require('node:v8');
fs.appendFileSync(process.env.DEPLOY_TEST_LOG, JSON.stringify({
  command: ${JSON.stringify(command)},
  args: process.argv.slice(2),
  nodeOptions: process.env.NODE_OPTIONS,
  heapLimitMb: v8.getHeapStatistics().heap_size_limit / 1024 / 1024,
}) + '\\n');
`);
      chmodSync(executable, 0o755);
    }
    const result = spawnSync('bash', [join(root, 'scripts/deploy-backend.sh')], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        REPO_ROOT: fixture,
        NVM_DIR: join(fixture, 'no-nvm'),
        NODE_OPTIONS: '--trace-warnings --max-old-space-size=2048',
        BACKEND_BUILD_HEAP_MB: '',
        DEPLOY_TEST_LOG: log,
        ...extraEnv,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test('backend deploy gives the compiler a 4 GB heap without changing PM2 runtime options', () => {
  const commands = runDeploy();
  const build = commands.find(({ command, args }) => command === 'npm' && args.join(' ') === 'run build');
  assert.ok(build, 'deployment must build the backend');
  assert.ok(build.heapLimitMb >= 4096, `compiler only received ${build.heapLimitMb} MB`);
  assert.match(build.nodeOptions, /--trace-warnings/);
  const restart = commands.find(({ command }) => command === 'pm2');
  assert.deepEqual(restart.args, ['restart', 'backend']);
  assert.equal(restart.nodeOptions, '--trace-warnings --max-old-space-size=2048');
});

test('backend deploy accepts an explicit compiler heap budget', () => {
  const commands = runDeploy({ BACKEND_BUILD_HEAP_MB: '3072' });
  const build = commands.find(({ command, args }) => command === 'npm' && args.join(' ') === 'run build');
  assert.match(build.nodeOptions, /--max-old-space-size=3072$/);
  // V8 also includes its young generation in heap_size_limit.
  assert.ok(build.heapLimitMb >= 3072 && build.heapLimitMb < 4096);
});
