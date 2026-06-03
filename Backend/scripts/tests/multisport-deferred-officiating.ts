import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const backendRoot = join(__dirname, '..', '..');
const tsNode = join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js');

const tests = [
  join(backendRoot, 'src/shared/officiatingLevel.test.ts'),
  join(backendRoot, 'src/shared/officiatingEnforcement.test.ts'),
  join(backendRoot, 'src/shared/matchFormat.test.ts'),
];

for (const testPath of tests) {
  const r = spawnSync(process.execPath, [tsNode, testPath], { cwd: backendRoot, stdio: 'inherit' });
  if ((r.status ?? 1) !== 0) process.exit(r.status ?? 1);
}
console.log('multisport-deferred-officiating: passed');
