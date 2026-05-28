import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

const backendRoot = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

type Suite = { label: string; command: string; args: string[]; env?: Record<string, string> };

const suites: Suite[] = [
  {
    label: 'multisport phase 0',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase0.ts'),
    ],
  },
  {
    label: 'multisport phase 1',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase1.ts'),
    ],
  },
  {
    label: 'multisport questionnaire q0',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-questionnaire-q0.ts'),
    ],
  },
  {
    label: 'multisport questionnaire q1',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-questionnaire-q1.ts'),
    ],
  },
  {
    label: 'multisport questionnaire tennis',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-questionnaire-tennis.ts'),
    ],
  },
  {
    label: 'multisport questionnaire q4',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-questionnaire-q4.ts'),
    ],
  },
  {
    label: 'multisport questionnaire q5',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-questionnaire-q5.ts'),
    ],
  },
  {
    label: 'multisport questionnaire q6',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-questionnaire-q6.ts'),
    ],
  },
  {
    label: 'multisport questionnaire audit',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-questionnaire-audit.ts'),
    ],
  },
  {
    label: 'outcome explanation',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'outcome-explanation.ts'),
    ],
  },
  {
    label: 'multisport trust patches',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-trust-patches.ts'),
    ],
  },
  {
    label: 'multisport phase 2',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase2.ts'),
    ],
  },
  {
    label: 'multisport phase 3 courts',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase3-courts.ts'),
    ],
  },
  {
    label: 'multisport phase 3 pickleball',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase3-pickleball.ts'),
    ],
  },
  {
    label: 'multisport phase 3',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase3.ts'),
    ],
  },
  {
    label: 'multisport phase 3 presets',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase3-presets.ts'),
    ],
  },
  {
    label: 'multisport deferred product',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-deferred-product.ts'),
    ],
  },
  {
    label: 'multisport phase 4 profile',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase4-profile.ts'),
    ],
  },
  {
    label: 'multisport phase 4 notifications',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase4-notifications.ts'),
    ],
  },
  {
    label: 'multisport phase 4 playtomic',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase4-playtomic.ts'),
    ],
  },
  {
    label: 'multisport phase 4 leagues',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase4-leagues.ts'),
    ],
  },
  {
    label: 'multisport phase 4',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase4.ts'),
    ],
  },
  {
    label: 'multisport phase 5 match size',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase5-match-size.ts'),
    ],
  },
  {
    label: 'multisport phase 6',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase6.ts'),
    ],
  },
  {
    label: 'cancelled game sport',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'cancelled-game-sport.ts'),
    ],
  },
  {
    label: 'watch level display',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'watch-level-display.ts'),
    ],
  },
  {
    label: 'multisport deferred',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-deferred.ts'),
    ],
  },
  {
    label: 'multisport post-wave2',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-post-wave2.ts'),
    ],
  },
  {
    label: 'multisport post-wave2',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-post-wave2.ts'),
    ],
  },
  {
    label: 'multisport post-wave2 watch',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-post-wave2.ts'),
    ],
  },
  {
    label: 'multisport phase 3 table tennis',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-phase3-table-tennis.ts'),
    ],
  },
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
    label: 'unread snapshot mark-read',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'unread-snapshot-mark-read.ts'),
    ],
  },
  {
    label: 'game photos',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'game-photos.ts'),
    ],
  },
  {
    label: 'game results artifacts',
    command: 'npm',
    args: ['run', 'test:game-results-artifacts'],
    env: { RESULTS_ARTIFACTS_ENABLED: 'true' },
  },
  {
    label: 'story-validate',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'story-validate.ts'),
    ],
  },
  {
    label: 'stories',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'stories.ts'),
    ],
  },
  {
    label: 'story engagement',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'story-engagement.ts'),
    ],
    env: {
      STORY_ENGAGEMENT_TEST_COMMENT_CAP: '3',
      STORY_ENGAGEMENT_SKIP_RATE_LIMIT: '1',
    },
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
      env: { ...process.env, ...s.env },
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
