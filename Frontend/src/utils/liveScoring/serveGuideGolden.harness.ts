/**
 * Shared serve-guide golden fixture runner (Vitest + Watch parity script).
 *
 * How to add a fixture:
 * 1. Append an object to `fixtures/serveGuideGolden.json` with `name`, `sport`, `preset`,
 *    roster (`teamAPlayerNames`, `teamBPlayerNames`, `matchDoubles`), and `expected`.
 * 2. Build state via `state` (partial LiveScoringState) or `initialSets` + `actions` (+ optional `serveSeed`).
 * 3. Set `expectNull: true` when serve coach should be hidden; use `motionTokenPrefix` instead of full `motionToken`.
 * 4. Bump `SERVE_GUIDE_GOLDEN_MIN_FIXTURES` and run `npm run test:live-scoring` plus Watch
 *    `ServeGuideGoldenFixturesTests` (macOS CI / `watch-serve-guide-parity.ts`).
 *
 * Catalog covers: classic progression, deuce/advantage/GP, in-set + super tie-break, Americano
 * official/simple rotation, TT/badminton/pickleball/squash change-ends (incl. badminton doubles).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import { getRules, isPointsRules, type ScoringRules } from '@/utils/scoring';
import {
  computeServeGuideSnapshotByPlugin,
  liveScoringServeGuideEnabled,
  resolveLiveScoringPlugin,
} from '@/liveScoring/registry';
import {
  computeServeGuideSnapshot,
  createInitialLiveScoringState,
  parseLiveScoringState,
  scoreLivePoint,
  type LiveScoringState,
  type LiveTeamSide,
  type ServeGuideSnapshot,
} from '@/utils/liveScoring';
import type { SetResult } from '@/types/gameResults';

export const SERVE_GUIDE_GOLDEN_FIXTURE_PATH = join(
  import.meta.dirname,
  'fixtures',
  'serveGuideGolden.json',
);

/** Bump when adding fixtures — issue #181 minimum scenario coverage. */
export const SERVE_GUIDE_GOLDEN_MIN_FIXTURES = 19;

export type ServeGuideGoldenExpected = Partial<
  Pick<
    ServeGuideSnapshot,
    | 'serverTeam'
    | 'serverPlayerIndex'
    | 'serverDisplayName'
    | 'courtSide'
    | 'tieBreakServeSlot'
    | 'changeEndsBeforeNextPoint'
    | 'courtEndsSwapped'
    | 'courtTeamASidesMirrored'
    | 'courtTeamBSidesMirrored'
    | 'motionToken'
  >
> & {
  motionTokenPrefix?: string;
};

export type ServeGuideGoldenFixture = {
  name: string;
  sport: Sport;
  preset: ScoringPreset;
  teamAPlayerNames: string[];
  teamBPlayerNames: string[];
  matchDoubles: boolean;
  initialSets?: SetResult[];
  actions?: LiveTeamSide[];
  serveSeed?: Pick<
    LiveScoringState,
    | 'firstServerTeam'
    | 'firstServerDoublesPlayerIndex'
    | 'pointsServeRotation'
    | 'matchStartCourtEndsSwapped'
    | 'matchStartTeamASidesMirrored'
    | 'matchStartTeamBSidesMirrored'
    | 'pointWinnerLog'
  >;
  state?: Partial<LiveScoringState>;
  rules?: { hasGoldenPoint?: boolean };
  expectNull?: boolean;
  expected?: ServeGuideGoldenExpected | null;
};

export function loadServeGuideGoldenFixtures(): ServeGuideGoldenFixture[] {
  const raw = JSON.parse(readFileSync(SERVE_GUIDE_GOLDEN_FIXTURE_PATH, 'utf8')) as ServeGuideGoldenFixture[];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('serveGuideGolden.json must be a non-empty array');
  }
  for (const fixture of raw) {
    if (!fixture.name || !fixture.sport || !fixture.preset) {
      throw new Error(`fixture missing name/sport/preset: ${JSON.stringify(fixture.name)}`);
    }
    if (fixture.expectNull !== true && !fixture.expected) {
      throw new Error(`fixture "${fixture.name}" needs expected or expectNull`);
    }
  }
  return raw;
}

export function rulesFromServeGuideFixture(fixture: ServeGuideGoldenFixture): ScoringRules {
  return getRules({
    sport: fixture.sport,
    scoringPreset: fixture.preset,
    hasGoldenPoint: fixture.rules?.hasGoldenPoint,
    matchTimerEnabled: false,
  });
}

export function buildStateFromServeGuideFixture(
  fixture: ServeGuideGoldenFixture,
  rules: ScoringRules,
): LiveScoringState {
  let state: LiveScoringState;
  if (fixture.actions?.length) {
    state = createInitialLiveScoringState(rules, fixture.initialSets);
    for (const side of fixture.actions) {
      state = scoreLivePoint(state, side, rules).state;
    }
    if (fixture.serveSeed) state = { ...state, ...fixture.serveSeed };
    if (fixture.state) state = { ...state, ...fixture.state };
  } else if (fixture.state) {
    state = parseLiveScoringState(fixture.state, rules, fixture.initialSets);
    if (fixture.serveSeed) state = { ...state, ...fixture.serveSeed };
  } else {
    state = createInitialLiveScoringState(rules, fixture.initialSets);
    if (fixture.serveSeed) state = { ...state, ...fixture.serveSeed };
  }
  return state;
}

export function computeServeGuideFromFixture(
  fixture: ServeGuideGoldenFixture,
): ServeGuideSnapshot | null {
  const rules = rulesFromServeGuideFixture(fixture);
  const state = buildStateFromServeGuideFixture(fixture, rules);
  const plugin = resolveLiveScoringPlugin(fixture.sport, fixture.preset);
  const playersPerMatch = fixture.matchDoubles ? 4 : 2;
  const usePlugin =
    liveScoringServeGuideEnabled(fixture.sport, plugin, rules) ||
    (!isPointsRules(rules) && plugin.serveGuideEnabled);
  if (usePlugin) {
    return computeServeGuideSnapshotByPlugin(
      plugin,
      state,
      rules,
      fixture.teamAPlayerNames,
      fixture.teamBPlayerNames,
      playersPerMatch,
    );
  }
  return computeServeGuideSnapshot(
    state,
    rules,
    fixture.teamAPlayerNames,
    fixture.teamBPlayerNames,
    fixture.matchDoubles,
  );
}

export function assertServeGuideMatchesFixture(
  actual: ServeGuideSnapshot | null,
  fixture: ServeGuideGoldenFixture,
): string | null {
  if (fixture.expectNull) {
    return actual != null ? `expected null snapshot for "${fixture.name}"` : null;
  }
  if (!actual) return `expected snapshot for "${fixture.name}"`;
  const expected = fixture.expected!;
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'motionTokenPrefix') {
      if (typeof value !== 'string' || !actual.motionToken.startsWith(value)) {
        return `${fixture.name}: motionToken "${actual.motionToken}" should start with "${value}"`;
      }
      continue;
    }
    const actualValue = actual[key as keyof ServeGuideSnapshot];
    if (JSON.stringify(actualValue) !== JSON.stringify(value)) {
      return `${fixture.name}: ${key} expected ${JSON.stringify(value)} got ${JSON.stringify(actualValue)}`;
    }
  }
  return null;
}

export function runServeGuideGoldenFixtures(): { passed: number; failures: string[] } {
  const fixtures = loadServeGuideGoldenFixtures();
  const failures: string[] = [];
  for (const fixture of fixtures) {
    const actual = computeServeGuideFromFixture(fixture);
    const err = assertServeGuideMatchesFixture(actual, fixture);
    if (err) failures.push(err);
  }
  return { passed: fixtures.length - failures.length, failures };
}
