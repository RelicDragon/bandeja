import type { ScoringRules } from '@/utils/scoring';
import { isClassicAutomaticRelaxedScores } from '@/utils/scoring';
import { validateClassicRegularSet, validateSuperTiebreak } from '@/utils/scoring/validateSet';
import { splitOfficialAndSupplementalSets } from '@/utils/matchSetRole';
import type { SetResult } from '@/types/gameResults';
import type {
  LiveAutomaticContinueChoice,
  LiveAutomaticRecordMode,
  LiveScoringActionResult,
  LiveScoringState,
} from './types';

function emptyClassic() {
  return {
    pointState: { kind: 'regular' as const, teamA: 0 as const, teamB: 0 as const },
    withinSetTieBreak: false,
    tieBreakA: 0,
    tieBreakB: 0,
    classicPointsPlayedInGame: 0,
    deuceCount: 0,
  };
}

function cloneState(state: LiveScoringState): LiveScoringState {
  return {
    ...state,
    sets: state.sets.map((set) => ({ ...set })),
    classic: state.classic ? { ...state.classic, pointState: { ...state.classic.pointState } } : undefined,
  };
}

function isPristineMatchStart(state: LiveScoringState): boolean {
  if (state.activeSetIndex !== 0) return false;
  return state.sets.every((s) => s.teamA === 0 && s.teamB === 0);
}

function activeSetDecisive(state: LiveScoringState): boolean {
  const set = state.sets[state.activeSetIndex];
  if (!set) return false;
  return (set.teamA > 0 || set.teamB > 0) && set.teamA !== set.teamB;
}

function setPlayed(set: SetResult): boolean {
  return set.teamA > 0 || set.teamB > 0;
}

/** Active Automatic set is finished (not mid-entry). Prior sets are always closed once left. */
function isActiveAutomaticSetClosed(state: LiveScoringState, rules: ScoringRules): boolean {
  const set = state.sets[state.activeSetIndex];
  if (!set || !setPlayed(set)) return false;
  if (set.isTieBreak) return validateSuperTiebreak(set.teamA, set.teamB, rules).ok;
  if (state.automaticRecordMode === 'AMERICANO_POINTS' || state.mode === 'points') {
    return state.automaticOpenEndedSetConfirmed === true;
  }
  if (state.timedClassicSetLocked) return true;
  return validateClassicRegularSet(set.teamA, set.teamB, rules).ok;
}

function closedAutomaticOfficialSets(state: LiveScoringState, rules: ScoringRules): SetResult[] {
  const { official } = splitOfficialAndSupplementalSets(state.sets);
  const closed: SetResult[] = [];
  for (let i = 0; i < official.length; i += 1) {
    const s = official[i];
    if (!setPlayed(s)) continue;
    if (i < state.activeSetIndex) {
      closed.push(s);
    } else if (i === state.activeSetIndex && isActiveAutomaticSetClosed(state, rules)) {
      closed.push(s);
    }
  }
  return closed;
}

function countClosedSetsWon(closed: SetResult[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const s of closed) {
    if (s.teamA > s.teamB) a += 1;
    else if (s.teamB > s.teamA) b += 1;
  }
  return { a, b };
}

/** Open-ended Automatic americano (not STB race) — needs explicit finish before advance. */
export function isAutomaticOpenEndedPointsSet(state: LiveScoringState, rules: ScoringRules): boolean {
  if (!isClassicAutomaticRelaxedScores(rules)) return false;
  if (state.automaticRecordMode !== 'AMERICANO_POINTS' && state.mode !== 'points') return false;
  if (state.mode !== 'points') return false;
  const set = state.sets[state.activeSetIndex];
  return Boolean(set && !set.isTieBreak);
}

export function automaticRecordModeChoicePending(state: LiveScoringState, rules: ScoringRules): boolean {
  if (!isClassicAutomaticRelaxedScores(rules)) return false;
  if (state.automaticRecordMode) return false;
  if (state.automaticEarlyFinish) return false;
  return isPristineMatchStart(state);
}

/**
 * After a completed Automatic set, ask before advancing (or ending early).
 * Not shown when the deciding-set format sheet is pending.
 */
export function optionalContinueSetPending(
  state: LiveScoringState,
  rules: ScoringRules,
  canAdvance: (s: LiveScoringState, r: ScoringRules) => boolean,
  deciderPending: (s: LiveScoringState, r: ScoringRules) => boolean,
): boolean {
  if (!isClassicAutomaticRelaxedScores(rules)) return false;
  if (!state.automaticRecordMode) return false;
  if (state.automaticEarlyFinish) return false;
  if (deciderPending(state, rules)) return false;
  if (isAutomaticLiveMatchComplete(state, rules)) return false;
  return canAdvance(state, rules);
}

export function canConfirmAutomaticOpenEndedSet(
  state: LiveScoringState,
  rules: ScoringRules,
  deciderPending: (s: LiveScoringState, r: ScoringRules) => boolean,
): boolean {
  if (!isAutomaticOpenEndedPointsSet(state, rules)) return false;
  if (state.automaticEarlyFinish) return false;
  if (state.automaticOpenEndedSetConfirmed) return false;
  if (deciderPending(state, rules)) return false;
  if (!activeSetDecisive(state)) return false;
  if (isAutomaticLiveMatchComplete(state, rules)) return false;
  return true;
}

export function applyAutomaticOpenEndedSetConfirm(
  input: LiveScoringState,
  rules: ScoringRules,
  deciderPending: (s: LiveScoringState, r: ScoringRules) => boolean,
): LiveScoringActionResult {
  if (!canConfirmAutomaticOpenEndedSet(input, rules, deciderPending)) {
    return { state: input, changed: false };
  }
  const state = cloneState(input);
  state.automaticOpenEndedSetConfirmed = true;
  return { state, changed: true };
}

export function applyAutomaticRecordMode(
  input: LiveScoringState,
  rules: ScoringRules,
  mode: LiveAutomaticRecordMode,
): LiveScoringActionResult {
  if (!automaticRecordModeChoicePending(input, rules)) return { state: input, changed: false };
  const state = cloneState(input);
  state.automaticRecordMode = mode;
  if (mode === 'AMERICANO_POINTS') {
    state.mode = 'points';
    state.classic = undefined;
  } else {
    state.mode = 'classic';
    state.classic = emptyClassic();
  }
  return { state, changed: true };
}

export function applyAutomaticContinueChoice(
  input: LiveScoringState,
  rules: ScoringRules,
  choice: LiveAutomaticContinueChoice,
  canAdvance: (s: LiveScoringState, r: ScoringRules) => boolean,
  deciderPending: (s: LiveScoringState, r: ScoringRules) => boolean,
  advance: (s: LiveScoringState, r: ScoringRules) => LiveScoringActionResult,
): LiveScoringActionResult {
  if (!optionalContinueSetPending(input, rules, canAdvance, deciderPending)) {
    return { state: input, changed: false };
  }
  if (choice === 'END') {
    const state = cloneState(input);
    state.automaticEarlyFinish = true;
    return { state, changed: true };
  }
  return advance(input, rules);
}

/**
 * Live Automatic match over: early finish, or enough *closed* sets won.
 * Mid-set scores on the active set must not count (unlike results entry).
 */
export function isAutomaticLiveMatchComplete(state: LiveScoringState, rules: ScoringRules): boolean {
  if (!isClassicAutomaticRelaxedScores(rules)) return false;
  if (state.automaticEarlyFinish) return true;
  const closed = closedAutomaticOfficialSets(state, rules);
  const { a, b } = countClosedSetsWon(closed);
  if (Math.max(a, b) >= rules.minSetsToWin) return true;
  if (rules.maxSetsPlayed > 0 && closed.length >= rules.maxSetsPlayed) return true;
  return false;
}

/** Resume mid-match without stored mode: infer from live mode. */
export function inferAutomaticRecordMode(state: LiveScoringState, rules: ScoringRules): LiveAutomaticRecordMode | undefined {
  if (!isClassicAutomaticRelaxedScores(rules)) return undefined;
  if (state.automaticRecordMode) return state.automaticRecordMode;
  if (isPristineMatchStart(state)) return undefined;
  return state.mode === 'points' ? 'AMERICANO_POINTS' : 'GAMES';
}

/** Seed record mode from match metadata / infer — apply on every hydrate path. */
export function seedAutomaticRecordModeOnState(
  state: LiveScoringState,
  rules: ScoringRules,
  matchMeta: Record<string, unknown> | undefined,
  parseMode: (meta: Record<string, unknown> | undefined) => LiveAutomaticRecordMode,
  metadataKey: string,
): LiveScoringState {
  if (!isClassicAutomaticRelaxedScores(rules)) return state;
  if (state.automaticRecordMode) return state;
  if (matchMeta?.[metadataKey] != null) {
    const seeded = parseMode(matchMeta);
    return {
      ...state,
      automaticRecordMode: seeded,
      mode: seeded === 'AMERICANO_POINTS' ? 'points' : 'classic',
      classic:
        seeded === 'AMERICANO_POINTS'
          ? undefined
          : state.classic ?? emptyClassic(),
    };
  }
  const inferred = inferAutomaticRecordMode(state, rules);
  return inferred ? { ...state, automaticRecordMode: inferred } : state;
}
