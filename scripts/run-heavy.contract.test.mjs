import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function withFixture(fn) {
  const fixture = realpathSync(mkdtempSync(join(tmpdir(), 'run-heavy-test-')));
  try {
    mkdirSync(join(fixture, 'scripts'));
    const runHeavy = join(fixture, 'scripts/run-heavy');
    writeFileSync(runHeavy, readFileSync(join(root, 'scripts/run-heavy')));
    chmodSync(runHeavy, 0o755);
    const tool = (dir, name) => {
      mkdirSync(dir, { recursive: true });
      const file = join(dir, name);
      writeFileSync(file, '#!/bin/sh\nexit 0\n');
      chmodSync(file, 0o755);
    };
    // A "global" tsc that must lose to the project's own copies.
    tool(join(fixture, 'global-bin'), 'tsc');
    tool(join(fixture, 'Frontend/node_modules/.bin'), 'tsc');
    tool(join(fixture, 'Backend/node_modules/.bin'), 'tsc');
    tool(join(fixture, 'node_modules/.bin'), 'tsc');
    tool(join(fixture, 'node_modules/.bin'), 'rootonly');
    mkdirSync(join(fixture, 'Frontend/src'), { recursive: true });
    fn(fixture, (cwd, args, env = {}) =>
      spawnSync(runHeavy, args, {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${join(fixture, 'global-bin')}:${process.env.PATH}`,
          PADELPULSE_HEAVY_LOCK_FILE: join(fixture, 'heavy.lock'),
          PADELPULSE_HEAVY_LOCK_HELD: '',
          ...env,
        },
      }));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

const which = ['sh', '-c', 'command -v tsc; command -v rootonly; pwd'];

for (const lane of ['Frontend', 'Backend']) {
  test(`${lane} lane resolves its own node_modules/.bin before global tools and keeps cwd`, () => {
    withFixture((fixture, run) => {
      for (const cwd of lane === 'Frontend' ? [join(fixture, lane), join(fixture, 'Frontend/src')] : [join(fixture, lane)]) {
        const result = run(cwd, which);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Waiting for PadelPulse (frontend|backend) heavy-task slot/);
        assert.deepEqual(result.stdout.trim().split('\n').slice(-3), [
          join(fixture, lane, 'node_modules/.bin/tsc'),
          join(fixture, 'node_modules/.bin/rootonly'),
          cwd,
        ]);
      }
    });
  });
}

test('shared lane resolves the repo root node_modules/.bin', () => {
  withFixture((fixture, run) => {
    const result = run(fixture, which);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.stdout.trim().split('\n').slice(-3), [
      join(fixture, 'node_modules/.bin/tsc'),
      join(fixture, 'node_modules/.bin/rootonly'),
      fixture,
    ]);
  });
});

test('nested run-heavy (lock already held) also uses the lane toolchain', () => {
  withFixture((fixture, run) => {
    const result = run(join(fixture, 'Backend'), which, { PADELPULSE_HEAVY_LOCK_HELD: '1' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.split('\n')[0], join(fixture, 'Backend/node_modules/.bin/tsc'));
  });
});

test('exit codes propagate', () => {
  withFixture((fixture, run) => {
    assert.equal(run(join(fixture, 'Frontend'), ['sh', '-c', 'exit 7']).status, 7);
  });
});
