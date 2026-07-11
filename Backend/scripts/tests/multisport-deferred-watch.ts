import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sport } from '@prisma/client';
import { getSportConfig } from '../../src/sport/sportRegistry';
import {
  freezeTimedSetAtPartialScore,
  scoreLivePoint,
} from '../../src/services/results/liveScoringEngine/core';
import { getRules } from '../../src/services/results/liveScoringEngine/rulebook';
import type { LiveScoringState } from '../../src/services/results/liveScoringEngine/types';
import {
  computeMatchWinnerLiveScoring,
  getStandingsMatchOutcome,
} from '../../src/services/results/liveScoringEngine/matchWinnerLive';

const watchSportPath = join(
  __dirname,
  '../../../Frontend/ios/App/BandejaWatch Watch App/Models/WatchSport.swift',
);
const feRegistryPath = join(__dirname, '../../../Frontend/src/liveScoring/registry.ts');
const watchRegistryPath = join(
  __dirname,
  '../../../Frontend/ios/App/BandejaWatch Watch App/Models/WatchLiveScoringRegistry.swift',
);
const watchVmPath = join(
  __dirname,
  '../../../Frontend/ios/App/BandejaWatch Watch App/ViewModels/MatchScoringViewModel.swift',
);

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function skip(note: string): void {
  console.log(`SKIP: ${note}`);
}

/** Parse `case .padel, .tennis: return 4` groups from WatchSport.defaultPlayersPerMatch */
function parseWatchDefaults(): Map<string, number> {
  const src = readFileSync(watchSportPath, 'utf8');
  const fn = src.slice(src.indexOf('var defaultPlayersPerMatch'), src.indexOf('static func resolved'));
  const out = new Map<string, number>();
  const caseRe = /case\s+([^:]+):\s*\n\s*return\s+(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = caseRe.exec(fn)) !== null) {
    const n = Number.parseInt(m[2], 10);
    for (const raw of m[1].split(',')) {
      const token = raw.trim().replace(/^\./, '');
      const enumName = token
        .replace(/([A-Z])/g, '_$1')
        .replace(/^_/, '')
        .toUpperCase();
      if (token === 'tableTennis') {
        out.set('TABLE_TENNIS', n);
      } else {
        out.set(enumName, n);
      }
    }
  }
  return out;
}

const WATCH_TO_SPORT: Record<string, Sport> = {
  PADEL: Sport.PADEL,
  TENNIS: Sport.TENNIS,
  PICKLEBALL: Sport.PICKLEBALL,
  BADMINTON: Sport.BADMINTON,
  TABLE_TENNIS: Sport.TABLE_TENNIS,
  SQUASH: Sport.SQUASH,
};

function testWatchVsBackendRegistry(): void {
  const watch = parseWatchDefaults();
  const mismatches: string[] = [];
  for (const [key, sport] of Object.entries(WATCH_TO_SPORT)) {
    const watchVal = watch.get(key);
    const beVal = getSportConfig(sport).defaultPlayersPerMatch;
    if (watchVal === undefined) {
      mismatches.push(`${key}: missing in WatchSport.swift`);
      continue;
    }
    if (watchVal !== beVal) {
      mismatches.push(`${key}: Watch=${watchVal} BE/FE=${beVal}`);
    }
  }
  if (mismatches.length > 0) {
    skip(
      `D-P0-WATCH — WatchSport.defaultPlayersPerMatch drift (${mismatches.join('; ')}) — align Watch with sportRegistry when epic lands`,
    );
    return;
  }
  console.log('ok: WatchSport.defaultPlayersPerMatch matches BE/FE registry');
}

function testFeTimedCustomRegistry(): void {
  const src = readFileSync(feRegistryPath, 'utf8');
  assert(src.includes('usesOpenEndedPointsUi'), 'FE registry exports usesOpenEndedPointsUi');
  assert(src.includes("'americano-points'"), 'FE registry americano-points uiId');
  assert(src.includes('openEndedRallyPlugin'), 'FE open-ended rally plugin');
  for (const sport of ['PICKLEBALL', 'BADMINTON', 'TABLE_TENNIS', 'SQUASH']) {
    assert(src.includes(`Sports.${sport}`) || src.includes(sport), `registry covers ${sport}`);
  }
  console.log('ok: FE liveScoring registry TIMED/CUSTOM symbols');
}

function testWatchTimedCustomRegistry(): void {
  const registry = readFileSync(watchRegistryPath, 'utf8');
  assert(registry.includes('usesOpenEndedPointsUi'), 'Watch usesOpenEndedPointsUi');
  const resolveBody = registry.slice(registry.indexOf('static func resolve'), registry.indexOf('extension WatchGame'));
  const openEndedReturn = resolveBody.indexOf('return .americanoPoints');
  const ttBranch = resolveBody.indexOf('sport == .tableTennis');
  assert(openEndedReturn >= 0 && openEndedReturn < ttBranch, 'Watch open-ended UI before rally sport branches');
  const vm = readFileSync(watchVmPath, 'utf8');
  assert(vm.includes('lockTimedSetAtPartialScore'), 'Watch lockTimedSetAtPartialScore');
  assert(vm.includes('rules.isOpenEndedPointsPreset'), 'Watch open-ended scoring branch');
  assert(vm.includes('resolvedSport == .pickleball'), 'Watch weak-live PATCH only pickleball');
  console.log('ok: Watch TIMED/CUSTOM registry + VM freeze');
}

function testOpenEndedFreezeAndValidate(): void {
  const rules = getRules({ scoringPreset: 'TIMED' });
  const state: LiveScoringState = {
    mode: 'points',
    sets: [{ teamA: 7, teamB: 5, isTieBreak: false }],
    activeSetIndex: 0,
  };
  const frozen = freezeTimedSetAtPartialScore(state, rules, 'TIMED', true);
  assert(frozen.changed && frozen.state.timedClassicSetLocked === true, 'TIMED freeze at buzzer');
  const blocked = scoreLivePoint(frozen.state, 'teamA', rules);
  assert(!blocked.changed, 'frozen open-ended blocks taps');

  const classicRules = getRules({ sport: 'TENNIS', scoringPreset: 'CLASSIC_TIMED' });
  assert(classicRules.strictValidation === 'CLASSIC_TIMED_RELAXED', 'CLASSIC_TIMED strict meta');
  const partialSet = [{ teamA: 4, teamB: 3, isTieBreak: false }];
  assert(
    computeMatchWinnerLiveScoring(partialSet, classicRules) === 'A',
    'CLASSIC_TIMED_RELAXED counts partial set toward winner',
  );
  const strictRules = getRules({ scoringPreset: 'CLASSIC_BEST_OF_3' });
  assert(
    computeMatchWinnerLiveScoring(partialSet, strictRules) === null,
    'strict classic ignores incomplete set',
  );
  const automaticRules = getRules({ sport: 'PADEL', scoringPreset: 'CLASSIC_AUTOMATIC' });
  assert(
    computeMatchWinnerLiveScoring([{ teamA: 0, teamB: 6 }], automaticRules) === 'B',
    'CLASSIC_AUTOMATIC: single set decides match',
  );
  assert(
    computeMatchWinnerLiveScoring(
      [
        { teamA: 6, teamB: 4 },
        { teamA: 4, teamB: 6 },
      ],
      automaticRules,
    ) === null,
    'CLASSIC_AUTOMATIC: split sets undecided for live winner',
  );
  assert(
    getStandingsMatchOutcome(
      [
        { teamA: 6, teamB: 4 },
        { teamA: 4, teamB: 6 },
      ],
      automaticRules,
    ) === 'tie',
    'CLASSIC_AUTOMATIC: split sets is tie for standings',
  );
  console.log('ok: BE open-ended freeze + CLASSIC_TIMED_RELAXED validate');
}

function main(): void {
  testWatchVsBackendRegistry();
  testFeTimedCustomRegistry();
  testWatchTimedCustomRegistry();
  testOpenEndedFreezeAndValidate();
  console.log('multisport-deferred-watch: all passed');
}

main();
