import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

const backendRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

type Suite = { label: string; command: string; args: string[] };

const suites: Suite[] = [
  {
    label: 'currency service',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'test-currency-service.ts'),
    ],
  },
  {
    label: 'match live scoring',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'qa-matchLiveScoring.ts'),
    ],
  },
  {
    label: 'allow user in multiple teams (§12)',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'qa-allowUserInMultipleTeams.ts'),
    ],
  },
  {
    label: 'league round generation',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'qa-leagueRoundGeneration.ts'),
    ],
  },
  {
    label: 'americano random round generation',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'qa-americanoRandomRoundGeneration.ts'),
    ],
  },
  {
    label: 'club admin schedule',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'club-admin-schedule.ts'),
    ],
  },
  {
    label: 'club admin suite',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'club-admin.suite.ts'),
    ],
  },
  {
    label: 'mexicano (escalera) round generation',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'qa-mexicanoRoundGeneration.ts'),
    ],
  },
];

function main() {
  console.log(`Running ${suites.length} automated test suites from ${backendRoot}\n`);

  for (let i = 0; i < suites.length; i++) {
    const s = suites[i];
    console.log(`--- [${i + 1}/${suites.length}] ${s.label} ---`);
    const r = spawnSync(s.command, s.args, {
      cwd: backendRoot,
      stdio: 'inherit',
      env: process.env,
    });
    const code = r.status ?? 1;
    if (code !== 0) {
      console.error(`\nStopped: "${s.label}" exited with ${code}`);
      process.exit(code);
    }
    console.log('');
  }

  console.log('All automated test suites passed.');
}

main();
