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
    label: 'multisport rotation c3',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-rotation-c3.ts'),
    ],
  },
  {
    label: 'multisport kotc c6',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-kotc-c6.ts'),
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
    label: 'multisport gates',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-gates.ts'),
    ],
  },
  {
    label: 'multisport e2e smoke',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-e2e-smoke.ts'),
    ],
  },
  {
    label: 'multisport formats tier B/C',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-formats-tier-bc.ts'),
    ],
  },
  {
    label: 'multisport strict validation unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'shared', 'strictValidation.test.ts'),
    ],
  },
  {
    label: 'club sports validation unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'shared', 'clubSports.test.ts'),
    ],
  },
  {
    label: 'multisport classic set validation unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'results', 'classicSetScoreValidation.test.ts'),
    ],
  },
  {
    label: 'multisport rating engine unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'results', 'ratingEngine.test.ts'),
    ],
  },
  {
    label: 'player aggregates placement unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'results', 'playerAggregates.test.ts'),
    ],
  },
  {
    label: 'outcome stats snapshot unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'results', 'outcomeStatsSnapshot.test.ts'),
    ],
  },
  {
    label: 'round robin generation unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'results', 'generation', 'roundRobin.test.ts'),
    ],
  },
  {
    label: 'isPresetLegal unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'shared', 'isPresetLegal.test.ts'),
    ],
  },
  {
    label: 'multisport validators unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'utils', 'validators', 'multisportValidation.test.ts'),
    ],
  },
  {
    label: 'game format normalization unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'utils', 'gameFormat', 'normalizeGameFormatPatch.test.ts'),
    ],
  },
  {
    label: 'game format update keys unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'shared', 'gameFormatUpdateKeys.test.ts'),
    ],
  },
  {
    label: 'shared module FE/BE parity',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'shared', 'sharedModuleParity.test.ts'),
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
    label: 'oauth account link',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'oauth-account-link.ts'),
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
    label: 'multisport ratings r5 r6',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'multisport-ratings-r5-r6.ts'),
    ],
  },
  {
    label: 'sport rating unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'utils', 'sportRating.test.ts'),
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
    label: 'watch serve guide parity',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'watch-serve-guide-parity.ts'),
    ],
  },
  {
    label: 'watch scoring parity',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'watch-scoring-parity.ts'),
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
    label: 'watch session activeMatchId',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'game', 'watchSession.service.test.ts'),
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
    label: 'unread auto-read notify unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'chat', 'unreadAutoReadNotify.test.ts'),
    ],
  },
  {
    label: 'unread bulk invalidate unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'chat', 'unreadBulkInvalidate.test.ts'),
    ],
  },
  {
    label: 'unread authority unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'chat', 'unreadAuthority', 'unreadAuthority.test.ts'),
    ],
  },
  {
    label: 'unread mark-all-read unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'chat', 'unreadAuthority', 'markAllRead.test.ts'),
    ],
  },
  {
    label: 'unread mark-all atomicity integration',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'unread-mark-all-atomicity.ts'),
    ],
  },
  {
    label: 'unread authority revisions integration',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'unread-authority-revisions.ts'),
    ],
  },
  {
    label: 'unread count query integration',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'unread-count-query.ts'),
    ],
  },
  {
    label: 'message create unread notify unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'chat', 'messageCreateUnreadNotify.test.ts'),
    ],
  },
  {
    label: 'message create unread notify integration',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'message-create-unread-notify.ts'),
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
    label: 'ads suite',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'ads.suite.ts'),
    ],
  },
  {
    label: 'bets suite',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'bets.suite.ts'),
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
    label: 'story dm reply',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'story-dm-reply.ts'),
    ],
  },
  {
    label: 'invite decline message',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'invite-decline-message.ts'),
    ],
  },
  {
    label: 'game chat read access',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'game-chat-read-access.ts'),
    ],
  },
  {
    label: 'game chat socket filter',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'game-chat-socket-filter.ts'),
    ],
  },
  {
    label: 'game chat sync filter',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'game-chat-sync-filter.ts'),
    ],
  },
  {
    label: 'game chat sync filter unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'chat', 'gameChatSyncEventFilter.test.ts'),
    ],
  },
  {
    label: 'bet payout reconcile',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'bets', 'betResolutionPayout.test.ts'),
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
  {
    label: 'booktime ingest unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'shared', 'booktime', 'ingest.test.ts'),
    ],
  },
  {
    label: 'booktime infer court sport unit',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'shared', 'booktime', 'inferCourtSport.test.ts'),
    ],
  },
  {
    label: 'booktime no outbound HTTP',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'booktime', 'booktimeNoOutboundHttp.test.ts'),
    ],
  },
  {
    label: 'chat notification media preview',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'shared', 'chat-notification-media-preview.test.ts'),
    ],
  },
  {
    label: 'fcm chat media preview',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'push', 'fcm.service.test.ts'),
    ],
  },
  {
    label: 'apns mutable content',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'push', 'push-notification.service.test.ts'),
    ],
  },
  {
    label: 'user chat push preview',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'push', 'notifications', 'user-chat-push.notification.test.ts'),
    ],
  },
  {
    label: 'game chat push preview',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'push', 'notifications', 'game-chat-push.notification.test.ts'),
    ],
  },
  {
    label: 'group chat push preview',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'push', 'notifications', 'group-chat-push.notification.test.ts'),
    ],
  },
  {
    label: 'bug chat push preview',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'push', 'notifications', 'bug-chat-push.notification.test.ts'),
    ],
  },
  {
    label: 'telegram chat media preview',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'src', 'services', 'telegram', 'notifications', 'telegram-chat-media.notification.test.ts'),
    ],
  },
  {
    label: 'game external booking',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'game-external-booking.ts'),
    ],
  },
  {
    label: 'game link booking',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'game-link-booking.ts'),
    ],
  },
  {
    label: 'game booking status fields',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'game-booking-status-fields.ts'),
    ],
  },
  {
    label: 'game booking status sync',
    command: process.execPath,
    args: [
      '-r',
      'dotenv/config',
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'tests', 'game-booking-status-sync.ts'),
    ],
  },
  {
    label: 'app release baseline lib',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'lib', 'app-release.test.ts'),
    ],
  },
  {
    label: 'app release planner',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'lib', 'app-release-planner.test.ts'),
    ],
  },
  {
    label: 'app release build',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'lib', 'app-release-build.test.ts'),
    ],
  },
  {
    label: 'app release timer',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'lib', 'app-release-timer.test.ts'),
    ],
  },
  {
    label: 'app release upload',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'lib', 'app-release-upload.test.ts'),
    ],
  },
  {
    label: 'app release finalize',
    command: process.execPath,
    args: [
      path.join(backendRoot, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      path.join(backendRoot, 'scripts', 'lib', 'app-release-finalize.test.ts'),
    ],
  },
];

function parseSuiteIndexArg(prefix: string): number | null {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  if (!arg) return null;
  const n = Number.parseInt(arg.slice(prefix.length + 1), 10);
  return Number.isFinite(n) && n >= 1 && n <= suites.length ? n - 1 : null;
}

function runSuite(i: number): number {
  const s = suites[i];
  console.log(`--- [${i + 1}/${suites.length}] ${s.label} ---`);
  const r = spawnSync(s.command, s.args, {
    cwd: backendRoot,
    stdio: 'inherit',
    env: { ...process.env, ...s.env },
  });
  return r.status ?? 1;
}

function main() {
  const onlyIdx = parseSuiteIndexArg('--only');
  const fromIdx = parseSuiteIndexArg('--from') ?? 0;
  const start = onlyIdx ?? fromIdx;
  const end = onlyIdx != null ? onlyIdx : suites.length - 1;

  if (start > end || start < 0 || end >= suites.length) {
    console.error(`Invalid range: suites are numbered 1–${suites.length}`);
    process.exit(1);
  }

  const count = end - start + 1;
  console.log(`Running ${count} automated test suite(s) from ${backendRoot}\n`);

  for (let i = start; i <= end; i++) {
    const code = runSuite(i);
    if (code !== 0) {
      console.error(`\nStopped: "${suites[i].label}" exited with ${code}`);
      console.error(`Resume with: npm run test:automated -- --from=${i + 1}`);
      process.exit(code);
    }
    console.log('');
  }

  if (onlyIdx != null) {
    console.log(`Suite ${onlyIdx + 1} passed: ${suites[onlyIdx].label}`);
  } else if (end === suites.length - 1) {
    console.log('All automated test suites passed.');
  } else {
    console.log(`Suites ${start + 1}–${end + 1} passed.`);
  }
}

main();
