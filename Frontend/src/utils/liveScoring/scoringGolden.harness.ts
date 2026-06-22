/**
 * Shared live-scoring golden fixture runner (Vitest + Watch parity script).
 *
 * Schema (each fixture object):
 * - name: string — unique label
 * - sport: Sport — e.g. PADEL
 * - preset: ScoringPreset — e.g. CLASSIC_BEST_OF_3
 * - rules?: { deucesBeforeGoldenPoint?, superTieBreakReplacesDeciderAtIndex? } — overrides
 * - initialSets?: SetResult[] — starting rows before actions
 * - state?: Partial<LiveScoringState> — overlay after initialSets (point/game context)
 * - actions?: LiveTeamSide[] — sequential scoreLivePoint taps
 * - expected: partial state + derived flags (changed, canAdvanceLiveSet, matchWinner, optionalDeciderChoicePending)
 *
 * How to add a fixture: append to fixtures/scoringGolden.json, bump SCORING_GOLDEN_MIN_FIXTURES,
 * run npm run test:live-scoring and Watch ScoringGoldenFixturesTests (watch-scoring-parity.ts).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ScoringPreset } from '@/types';
import type { Sport } from '@shared/sport';
import { computeMatchWinner, getRules, type ScoringRules } from '@/utils/scoring';
import {
  canAdvanceLiveSet,
  createInitialLiveScoringState,
  optionalDeciderChoicePending,
  parseLiveScoringState,
  scoreLivePoint,
  type LiveScoringActionResult,
  type LiveScoringClassicState,
  type LiveScoringState,
  type LiveTeamSide,
} from '@/utils/liveScoring';
import type { SetResult } from '@/types/gameResults';

export const SCORING_GOLDEN_FIXTURE_PATH = join(import.meta.dirname, 'fixtures', 'scoringGolden.json');

/** Bump when adding fixtures — issue #191 minimum scenario coverage. */
export const SCORING_GOLDEN_MIN_FIXTURES = 9;

export type ScoringGoldenExpected = {
  changed?: boolean;
  activeSetIndex?: number;
  sets?: Partial<SetResult>[];
  classic?: Partial<LiveScoringClassicState>;
  canAdvanceLiveSet?: boolean;
  matchWinner?: 'A' | 'B' | null;
  optionalDeciderChoicePending?: boolean;
};

export type ScoringGoldenFixture = {
  name: string;
  sport: Sport;
  preset: ScoringPreset;
  rules?: {
    deucesBeforeGoldenPoint?: number | null;
    superTieBreakReplacesDeciderAtIndex?: number | null;
  };
  initialSets?: SetResult[];
  state?: Partial<LiveScoringState>;
  actions?: LiveTeamSide[];
  expected: ScoringGoldenExpected;
};

export function loadScoringGoldenFixtures(): ScoringGoldenFixture[] {
  const raw = JSON.parse(readFileSync(SCORING_GOLDEN_FIXTURE_PATH, 'utf8')) as ScoringGoldenFixture[];
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('scoringGolden.json must be a non-empty array');
  }
  for (const fixture of raw) {
    if (!fixture.name || !fixture.sport || !fixture.preset) {
      throw new Error(`fixture missing name/sport/preset: ${JSON.stringify(fixture.name)}`);
    }
    if (!fixture.expected || typeof fixture.expected !== 'object') {
      throw new Error(`fixture "${fixture.name}" needs expected`);
    }
  }
  return raw;
}

export function rulesFromScoringFixture(fixture: ScoringGoldenFixture): ScoringRules {
  const base = getRules({
    sport: fixture.sport,
    scoringPreset: fixture.preset,
    deucesBeforeGoldenPoint: fixture.rules?.deucesBeforeGoldenPoint ?? null,
    matchTimerEnabled: false,
  });
  if (fixture.rules && 'superTieBreakReplacesDeciderAtIndex' in fixture.rules) {
    return {
      ...base,
      superTieBreakReplacesDeciderAtIndex: fixture.rules.superTieBreakReplacesDeciderAtIndex ?? null,
    };
  }
  return base;
}

export function buildStateFromScoringFixture(
  fixture: ScoringGoldenFixture,
  rules: ScoringRules,
): LiveScoringState {
  let state = createInitialLiveScoringState(rules, fixture.initialSets);
  if (fixture.state) {
    state = parseLiveScoringState(
      { ...state, ...fixture.state, sets: fixture.state.sets ?? state.sets },
      rules,
      fixture.initialSets,
    );
  }
  return state;
}

export function runScoringFixture(
  fixture: ScoringGoldenFixture,
): LiveScoringActionResult & { rules: ScoringRules } {
  const rules = rulesFromScoringFixture(fixture);
  let state = buildStateFromScoringFixture(fixture, rules);
  let changed = false;
  const actions = fixture.actions ?? [];
  if (actions.length === 0) {
    return { state, changed: false, rules };
  }
  for (const side of actions) {
    const result = scoreLivePoint(state, side, rules);
    if (result.changed) changed = true;
    state = result.state;
  }
  return { state, changed, rules };
}

function matchWinnerLabel(rules: ScoringRules, state: LiveScoringState): 'A' | 'B' | null {
  const winner = computeMatchWinner(state.sets, rules);
  if (winner === 'A') return 'A';
  if (winner === 'B') return 'B';
  return null;
}

export function assertScoringMatchesFixture(
  result: LiveScoringActionResult & { rules: ScoringRules },
  fixture: ScoringGoldenFixture,
): string | null {
  const { state, changed, rules } = result;
  const expected = fixture.expected;

  if (expected.changed !== undefined && changed !== expected.changed) {
    return `${fixture.name}: changed expected ${expected.changed} got ${changed}`;
  }
  if (expected.activeSetIndex !== undefined && state.activeSetIndex !== expected.activeSetIndex) {
    return `${fixture.name}: activeSetIndex expected ${expected.activeSetIndex} got ${state.activeSetIndex}`;
  }
  if (expected.sets) {
    for (let i = 0; i < expected.sets.length; i += 1) {
      const exp = expected.sets[i];
      const actual = state.sets[i];
      if (!actual) return `${fixture.name}: missing set row ${i}`;
      for (const [key, value] of Object.entries(exp)) {
        const actualValue = actual[key as keyof SetResult];
        if (JSON.stringify(actualValue) !== JSON.stringify(value)) {
          return `${fixture.name}: sets[${i}].${key} expected ${JSON.stringify(value)} got ${JSON.stringify(actualValue)}`;
        }
      }
    }
  }
  if (expected.classic) {
    const actualClassic = state.classic;
    if (!actualClassic) return `${fixture.name}: expected classic state`;
    for (const [key, value] of Object.entries(expected.classic)) {
      const actualValue = actualClassic[key as keyof LiveScoringClassicState];
      if (JSON.stringify(actualValue) !== JSON.stringify(value)) {
        return `${fixture.name}: classic.${key} expected ${JSON.stringify(value)} got ${JSON.stringify(actualValue)}`;
      }
    }
  }
  if (expected.canAdvanceLiveSet !== undefined) {
    const actual = canAdvanceLiveSet(state, rules);
    if (actual !== expected.canAdvanceLiveSet) {
      return `${fixture.name}: canAdvanceLiveSet expected ${expected.canAdvanceLiveSet} got ${actual}`;
    }
  }
  if (expected.optionalDeciderChoicePending !== undefined) {
    const actual = optionalDeciderChoicePending(state, rules);
    if (actual !== expected.optionalDeciderChoicePending) {
      return `${fixture.name}: optionalDeciderChoicePending expected ${expected.optionalDeciderChoicePending} got ${actual}`;
    }
  }
  if (expected.matchWinner !== undefined) {
    const actual = matchWinnerLabel(rules, state);
    if (actual !== expected.matchWinner) {
      return `${fixture.name}: matchWinner expected ${expected.matchWinner} got ${actual}`;
    }
  }
  return null;
}

export function runScoringGoldenFixtures(): { passed: number; failures: string[] } {
  const fixtures = loadScoringGoldenFixtures();
  const failures: string[] = [];
  for (const fixture of fixtures) {
    const result = runScoringFixture(fixture);
    const err = assertScoringMatchesFixture(result, fixture);
    if (err) failures.push(err);
  }
  return { passed: fixtures.length - failures.length, failures };
}
