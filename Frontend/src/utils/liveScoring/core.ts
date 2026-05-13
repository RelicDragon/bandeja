import type { ScoringRules } from '@/utils/scoring';
import { isClassicRules } from '@/utils/scoring';
import { trimTrailingEmptyAfterDecision } from '@/utils/scoring/displaySets';
import { computeMatchWinnerLiveScoring } from '@/utils/scoring/matchWinner';
import { splitOfficialAndSupplementalSets } from '@/utils/matchSetRole';
import { validatePointsSet } from '@/utils/scoring/validateSet';
import type {
  LiveClassicPointState,
  LiveOptionalDeciderFormat,
  LivePointValue,
  LiveScoringActionResult,
  LiveScoringClassicState,
  LiveScoringState,
  LiveTeamSide,
} from './types';
import type { SetResult } from '@/types/gameResults';

const nextPoint: Record<LivePointValue, LivePointValue> = { 0: 15, 15: 30, 30: 40, 40: 40 };
const previousPoint: Partial<Record<LivePointValue, LivePointValue>> = { 15: 0, 30: 15, 40: 30 };

const emptyClassic = (): LiveScoringClassicState => ({
  pointState: { kind: 'regular', teamA: 0, teamB: 0 },
  withinSetTieBreak: false,
  tieBreakA: 0,
  tieBreakB: 0,
  classicPointsPlayedInGame: 0,
});

const normalizeSets = (sets: SetResult[] | undefined): SetResult[] => {
  const normalized = (sets ?? []).map((set) => ({
    teamA: Math.max(0, Number(set.teamA) || 0),
    teamB: Math.max(0, Number(set.teamB) || 0),
    isTieBreak: Boolean(set.isTieBreak),
    role: set.role,
  }));
  return normalized.length ? normalized : [{ teamA: 0, teamB: 0, isTieBreak: false }];
};

export const createInitialLiveScoringState = (rules: ScoringRules, sets?: SetResult[]): LiveScoringState => {
  const mode = isClassicRules(rules) ? 'classic' : 'points';
  const normalized = normalizeSets(sets);
  const state: LiveScoringState = {
    activeSetIndex: 0,
    mode,
    sets: normalized,
    classic: mode === 'classic' ? syncClassicTieBreakForActiveSet(emptyClassic(), normalized, 0, rules) : undefined,
  };
  if (mode === 'classic') alignMandatedSuperTieBreakDecider(state, rules);
  return state;
};

export const parseLiveScoringState = (raw: unknown, rules: ScoringRules, fallbackSets?: SetResult[]): LiveScoringState => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createInitialLiveScoringState(rules, fallbackSets);
  const o = raw as Partial<LiveScoringState>;
  const base = createInitialLiveScoringState(rules, fallbackSets);
  const sets = normalizeSets(Array.isArray(o.sets) ? o.sets : fallbackSets);
  const activeSetIndex =
    typeof o.activeSetIndex === 'number' && Number.isInteger(o.activeSetIndex) && o.activeSetIndex >= 0
      ? Math.min(o.activeSetIndex, Math.max(sets.length - 1, 0))
      : base.activeSetIndex;
  const mode = o.mode === 'classic' || o.mode === 'points' ? o.mode : base.mode;
  const classic = mode === 'classic' ? normalizeClassic(o.classic, sets, activeSetIndex, rules) : undefined;
  const parsed: LiveScoringState = {
    activeSetIndex,
    mode,
    sets,
    classic,
    firstServerTeam: o.firstServerTeam === 'teamA' || o.firstServerTeam === 'teamB' ? o.firstServerTeam : undefined,
    firstServerDoublesPlayerIndex:
      typeof o.firstServerDoublesPlayerIndex === 'number' ? o.firstServerDoublesPlayerIndex : undefined,
    serveGuideSkipped: typeof o.serveGuideSkipped === 'boolean' ? o.serveGuideSkipped : undefined,
    optionalDeciderFormat:
      o.optionalDeciderFormat === 'REGULAR_SET' || o.optionalDeciderFormat === 'SUPER_TIEBREAK'
        ? o.optionalDeciderFormat
        : undefined,
    timedClassicSetLocked: o.timedClassicSetLocked === true ? true : undefined,
  };
  if (mode === 'classic') alignMandatedSuperTieBreakDecider(parsed, rules);
  return parsed;
};

export const scoreLivePoint = (input: LiveScoringState, side: LiveTeamSide, rules: ScoringRules): LiveScoringActionResult => {
  if (input.mode === 'classic') {
    if (optionalDeciderChoicePending(input, rules)) return { state: input, changed: false };
    if (input.timedClassicSetLocked) return { state: input, changed: false };
  }
  const state = cloneState(input);
  ensureSetExists(state, rules);

  if (state.mode !== 'classic') {
    const active = state.sets[state.activeSetIndex];
    if (isLivePointsFrozen(active, rules)) return { state: input, changed: false };
    const nextA = side === 'teamA' ? active.teamA + 1 : active.teamA;
    const nextB = side === 'teamB' ? active.teamB + 1 : active.teamB;
    if (rules.totalPointsPerSet > 0 && nextA + nextB > rules.totalPointsPerSet) return { state: input, changed: false };
    if (rules.maxPointsPerTeam > 0 && (nextA > rules.maxPointsPerTeam || nextB > rules.maxPointsPerTeam)) {
      return { state: input, changed: false };
    }
    active[side] += 1;
    return { state, changed: true };
  }

  state.classic = state.classic ?? emptyClassic();

  if (activeSetIsSuperTieBreak(state)) {
    const set = state.sets[state.activeSetIndex];
    if (pointRaceCompleted(set.teamA, set.teamB, superTieBreakTarget(rules), rules.superTieBreakWinBy)) {
      return { state: input, changed: false };
    }
    set[side] += 1;
    return { state: autoAdvanceCompletedSets(state, rules), changed: true };
  }

  if (state.classic.withinSetTieBreak) {
    if (side === 'teamA') state.classic.tieBreakA += 1;
    else state.classic.tieBreakB += 1;
    if (pointRaceCompleted(state.classic.tieBreakA, state.classic.tieBreakB, tieBreakTarget(rules), rules.tieBreakGameWinBy)) {
      finishWithinSetTieBreak(state, rules);
    }
    return { state: autoAdvanceCompletedSets(state, rules), changed: true };
  }

  applyClassicPoint(state, side, rules);
  applyClassicPointsAfterUserScore(state);
  return { state: autoAdvanceCompletedSets(state, rules), changed: true };
};

export const unscoreLivePoint = (
  input: LiveScoringState,
  side: LiveTeamSide,
  rules: ScoringRules
): LiveScoringActionResult => {
  if (input.mode === 'classic' && input.timedClassicSetLocked) return { state: input, changed: false };
  const state = cloneState(input);
  ensureSetExists(state, rules);

  if (state.mode !== 'classic') {
    const set = state.sets[state.activeSetIndex];
    if (set[side] <= 0) return { state: input, changed: false };
    set[side] -= 1;
    return { state, changed: true };
  }

  state.classic = state.classic ?? emptyClassic();

  if (activeSetIsSuperTieBreak(state)) {
    const set = state.sets[state.activeSetIndex];
    if (set[side] <= 0) return { state: input, changed: false };
    set[side] -= 1;
    return { state, changed: true };
  }

  if (state.classic.withinSetTieBreak) {
    if (side === 'teamA' && state.classic.tieBreakA > 0) {
      state.classic.tieBreakA -= 1;
      return { state, changed: true };
    }
    if (side === 'teamB' && state.classic.tieBreakB > 0) {
      state.classic.tieBreakB -= 1;
      return { state, changed: true };
    }
    const set = state.sets[state.activeSetIndex];
    const n = gamesScoreForTieBreak(rules);
    if (set.teamA === n && set.teamB === n && set[side] > 0) {
      set[side] -= 1;
      state.classic.withinSetTieBreak = false;
      applyClassicPointsAfterUnscore(state);
      return { state, changed: true };
    }
    return { state: input, changed: false };
  }

  const pointState = state.classic.pointState;
  if (pointState.kind === 'advantage') {
    state.classic.pointState = { kind: 'regular', teamA: 40, teamB: 40 };
  } else {
    const regular =
      pointState.kind === 'deuce'
        ? ({ kind: 'regular' as const, teamA: 40 as LivePointValue, teamB: 40 as LivePointValue } as const)
        : pointState;
    const current = regular[side];
    const previous = previousPoint[current];
    if (previous !== undefined) {
      state.classic.pointState = { ...regular, [side]: previous };
    } else {
      const set = state.sets[state.activeSetIndex];
      if (set[side] <= 0) return { state: input, changed: false };
      set[side] -= 1;
      state.classic.pointState = { kind: 'regular', teamA: 40, teamB: 40 };
    }
  }

  applyClassicPointsAfterUnscore(state);
  return { state, changed: true };
};

export const canAdvanceLiveSet = (state: LiveScoringState, rules: ScoringRules): boolean => {
  if (state.activeSetIndex + 1 >= rules.maxSetsPlayed) return false;
  const set = state.sets[state.activeSetIndex];
  if (!set) return false;
  const { official } = splitOfficialAndSupplementalSets(state.sets);

  if (state.mode !== 'classic') {
    if (!(set.teamA > 0 || set.teamB > 0)) return false;
  } else if (set.isTieBreak) {
    if (!pointRaceCompleted(set.teamA, set.teamB, superTieBreakTarget(rules), rules.superTieBreakWinBy)) return false;
  } else if (!classicSetCompleted(set.teamA, set.teamB, rules, Boolean(state.timedClassicSetLocked))) {
    return false;
  }

  if (computeMatchWinnerLiveScoring(official, rules) !== null) return false;

  return true;
};

export const advanceLiveSet = (input: LiveScoringState, rules: ScoringRules): LiveScoringActionResult => {
  if (!canAdvanceLiveSet(input, rules)) return { state: input, changed: false };
  const state = cloneState(input);
  state.activeSetIndex += 1;
  state.timedClassicSetLocked = undefined;
  ensureSetExists(state, rules);
  if (state.mode === 'classic') {
    state.classic = syncClassicTieBreakForActiveSet(emptyClassic(), state.sets, state.activeSetIndex, rules);
  }
  return { state, changed: true };
};

function autoAdvanceCompletedSets(state: LiveScoringState, rules: ScoringRules): LiveScoringState {
  let s = state;
  while (s.mode === 'classic' && canAdvanceLiveSet(s, rules)) {
    const next = advanceLiveSet(s, rules);
    if (!next.changed) break;
    s = next.state;
  }
  return normalizeLiveSetsAfterDecision(s, rules);
}

export const getClassicPointLabels = (
  classic?: LiveScoringClassicState,
  rules?: Pick<ScoringRules, 'hasGoldenPoint'>
): { teamA: string; teamB: string; center: string } => {
  if (!classic) return { teamA: '0', teamB: '0', center: '' };
  if (classic.withinSetTieBreak) {
    return { teamA: String(classic.tieBreakA), teamB: String(classic.tieBreakB), center: 'Tie-break' };
  }
  const point = classic.pointState;
  if (point.kind === 'deuce') return { teamA: '40', teamB: '40', center: 'Deuce' };
  if (point.kind === 'advantage') {
    return { teamA: point.side === 'teamA' ? 'Ad' : '40', teamB: point.side === 'teamB' ? 'Ad' : '40', center: 'Advantage' };
  }
  if (rules?.hasGoldenPoint && point.teamA === 40 && point.teamB === 40) {
    return { teamA: '40', teamB: '40', center: 'GP' };
  }
  return { teamA: String(point.teamA), teamB: String(point.teamB), center: '' };
};

export const activeSetScore = (state: LiveScoringState): SetResult => {
  return state.sets[state.activeSetIndex] ?? { teamA: 0, teamB: 0 };
};

const cloneState = (state: LiveScoringState): LiveScoringState => ({
  ...state,
  sets: state.sets.map((set) => ({ ...set })),
  classic: state.classic ? { ...state.classic, pointState: { ...state.classic.pointState } } : undefined,
});

const normalizeClassic = (
  raw: unknown,
  sets: SetResult[],
  activeSetIndex: number,
  rules: ScoringRules
): LiveScoringClassicState => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return syncClassicTieBreakForActiveSet(emptyClassic(), sets, activeSetIndex, rules);
  }
  const o = raw as Partial<LiveScoringClassicState>;
  return syncClassicTieBreakForActiveSet(
    {
      pointState: normalizePointState(o.pointState, rules),
      withinSetTieBreak: typeof o.withinSetTieBreak === 'boolean' ? o.withinSetTieBreak : false,
      tieBreakA: nonNegativeInt(o.tieBreakA),
      tieBreakB: nonNegativeInt(o.tieBreakB),
      classicPointsPlayedInGame: nonNegativeInt(o.classicPointsPlayedInGame),
    },
    sets,
    activeSetIndex,
    rules
  );
};

const normalizePointState = (raw: unknown, rules: ScoringRules): LiveClassicPointState => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'regular', teamA: 0, teamB: 0 };
  const o = raw as Partial<LiveClassicPointState>;
  if (o.kind === 'deuce' && rules.hasGoldenPoint) return { kind: 'regular', teamA: 40, teamB: 40 };
  if (o.kind === 'deuce') return { kind: 'deuce' };
  if (o.kind === 'advantage' && (o.side === 'teamA' || o.side === 'teamB')) return { kind: 'advantage', side: o.side };
  if (o.kind === 'regular' && isPoint(o.teamA) && isPoint(o.teamB)) return { kind: 'regular', teamA: o.teamA, teamB: o.teamB };
  return { kind: 'regular', teamA: 0, teamB: 0 };
};

const syncClassicTieBreakForActiveSet = (
  classic: LiveScoringClassicState,
  sets: SetResult[],
  activeSetIndex: number,
  rules: ScoringRules
): LiveScoringClassicState => {
  const set = sets[activeSetIndex];
  if (!set || set.isTieBreak) return classic;
  const n = gamesScoreForTieBreak(rules);
  if (set.teamA === n && set.teamB === n) return { ...classic, withinSetTieBreak: true };
  return classic;
};

const alignMandatedSuperTieBreakDecider = (state: LiveScoringState, rules: ScoringRules): void => {
  const stbIdx = rules.superTieBreakReplacesDeciderAtIndex;
  if (stbIdx == null) return;
  const { official, supplemental } = splitOfficialAndSupplementalSets(state.sets);
  if (stbIdx >= official.length) return;
  if (official[stbIdx].isTieBreak) return;
  const nextOfficial = official.map((row, i) => (i === stbIdx ? { ...row, isTieBreak: true } : row));
  state.sets = [...nextOfficial, ...supplemental];
};

const normalizeLiveSetsAfterDecision = (state: LiveScoringState, rules: ScoringRules): LiveScoringState => {
  if (state.mode !== 'classic') return state;
  const { official } = splitOfficialAndSupplementalSets(state.sets);
  if (computeMatchWinnerLiveScoring(official, rules) === null) return state;
  const trimmed = trimTrailingEmptyAfterDecision(state.sets, rules);
  state.sets = trimmed;
  const { official: off } = splitOfficialAndSupplementalSets(trimmed);
  let lastScored = 0;
  for (let i = 0; i < off.length; i += 1) {
    if (off[i].teamA > 0 || off[i].teamB > 0) lastScored = i;
  }
  state.activeSetIndex = Math.min(state.activeSetIndex, lastScored);
  return state;
};

const isLivePointsFrozen = (active: SetResult, rules: ScoringRules): boolean => {
  if (rules.totalPointsPerSet <= 0) return false;
  if (active.teamA + active.teamB !== rules.totalPointsPerSet) return false;
  return validatePointsSet(active.teamA, active.teamB, rules).ok;
};

const ensureSetExists = (state: LiveScoringState, rules: ScoringRules) => {
  for (;;) {
    const { official, supplemental } = splitOfficialAndSupplementalSets(state.sets);
    if (official.length > state.activeSetIndex) break;
    const priorOfficialLen = official.length;
    const isSuperTb =
      rules.superTieBreakReplacesDeciderAtIndex != null &&
      priorOfficialLen === rules.superTieBreakReplacesDeciderAtIndex;
    const newRow: SetResult = { teamA: 0, teamB: 0, isTieBreak: isSuperTb, role: 'OFFICIAL' };
    state.sets = [...official, newRow, ...supplemental];
  }
  if (state.mode === 'classic') alignMandatedSuperTieBreakDecider(state, rules);
};

const applyClassicPoint = (state: LiveScoringState, side: LiveTeamSide, rules: ScoringRules) => {
  const classic = state.classic ?? emptyClassic();
  const point = classic.pointState;

  if (point.kind === 'regular' && point.teamA === 40 && point.teamB === 40 && rules.hasGoldenPoint) {
    awardGame(state, side, rules);
    return;
  }

  if (point.kind === 'deuce') {
    classic.pointState = { kind: 'advantage', side };
  } else if (point.kind === 'advantage') {
    if (point.side === side) awardGame(state, side, rules);
    else classic.pointState = { kind: 'regular', teamA: 40, teamB: 40 };
  } else if (side === 'teamA') {
    if (point.teamA === 40 && point.teamB !== 40) awardGame(state, 'teamA', rules);
    else if (point.teamA === 40 && point.teamB === 40) classic.pointState = { kind: 'advantage', side: 'teamA' };
    else classic.pointState = { kind: 'regular', teamA: nextPoint[point.teamA], teamB: point.teamB };
  } else if (point.teamB === 40 && point.teamA !== 40) {
    awardGame(state, 'teamB', rules);
  } else if (point.teamA === 40 && point.teamB === 40) {
    classic.pointState = { kind: 'advantage', side: 'teamB' };
  } else {
    classic.pointState = { kind: 'regular', teamA: point.teamA, teamB: nextPoint[point.teamB] };
  }
};

const awardGame = (state: LiveScoringState, side: LiveTeamSide, rules: ScoringRules) => {
  ensureSetExists(state, rules);
  const set = state.sets[state.activeSetIndex];
  const classic = state.classic ?? emptyClassic();
  set[side] += 1;
  classic.pointState = { kind: 'regular', teamA: 0, teamB: 0 };
  classic.classicPointsPlayedInGame = 0;
  state.classic = classic;

  const n = gamesScoreForTieBreak(rules);
  if (set.teamA === n && set.teamB === n) {
    classic.withinSetTieBreak = true;
    classic.tieBreakA = 0;
    classic.tieBreakB = 0;
  }
};

const finishWithinSetTieBreak = (state: LiveScoringState, rules: ScoringRules) => {
  const classic = state.classic ?? emptyClassic();
  const n = gamesScoreForTieBreak(rules);
  state.sets[state.activeSetIndex] = {
    ...state.sets[state.activeSetIndex],
    teamA: classic.tieBreakA > classic.tieBreakB ? n + 1 : n,
    teamB: classic.tieBreakB > classic.tieBreakA ? n + 1 : n,
    isTieBreak: false,
  };
  classic.tieBreakA = 0;
  classic.tieBreakB = 0;
  classic.withinSetTieBreak = false;
};

const activeSetIsSuperTieBreak = (state: LiveScoringState): boolean => Boolean(state.sets[state.activeSetIndex]?.isTieBreak);

const pointRaceCompleted = (teamA: number, teamB: number, target: number, winBy: number): boolean => {
  const winner = Math.max(teamA, teamB);
  const loser = Math.min(teamA, teamB);
  return winner >= target && winner - loser >= winBy;
};

const classicSetCompleted = (teamA: number, teamB: number, rules: ScoringRules, timedLocked: boolean): boolean => {
  if (timedLocked && rules.allowIncompleteRegularSetGames) {
    return teamA > 0 || teamB > 0;
  }
  const hi = Math.max(teamA, teamB);
  const lo = Math.min(teamA, teamB);
  const tbAt = gamesScoreForTieBreak(rules);
  if (hi === tbAt && lo === tbAt) return false;
  if (hi === tbAt + 1 && lo === tbAt) return true;
  return hi >= rules.gamesPerSet && hi - lo >= rules.winBy;
};

export function optionalDeciderChoicePending(state: LiveScoringState, rules: ScoringRules): boolean {
  if (state.optionalDeciderFormat) return false;
  return isOptionalDeciderContext(state, rules);
}

function countOfficialSetsWon(sets: SetResult[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const s of sets) {
    if (!(s.teamA > 0 || s.teamB > 0)) continue;
    if (s.teamA > s.teamB) a += 1;
    else if (s.teamB > s.teamA) b += 1;
  }
  return { a, b };
}

function isOptionalDeciderContext(state: LiveScoringState, rules: ScoringRules): boolean {
  if (rules.superTieBreakReplacesDeciderAtIndex !== null) return false;
  if (state.mode !== 'classic') return false;
  if (rules.fixedNumberOfSets < 3 || rules.maxSetsPlayed < 3) return false;
  const { official } = splitOfficialAndSupplementalSets(state.sets);
  if (official.length < 3) return false;
  const prev = official.slice(0, -1);
  for (const s of prev) {
    if (s.isTieBreak) {
      if (!pointRaceCompleted(s.teamA, s.teamB, superTieBreakTarget(rules), rules.superTieBreakWinBy)) return false;
    } else if (!classicSetCompleted(s.teamA, s.teamB, rules, false)) return false;
  }
  const decider = official[official.length - 1];
  if (decider.teamA > 0 || decider.teamB > 0) return false;
  const deciderIdx = official.length - 1;
  if (state.activeSetIndex !== deciderIdx) return false;
  const { a, b } = countOfficialSetsWon(prev);
  return a === 1 && b === 1;
}

function deciderRowPristineForOptionalChoice(state: LiveScoringState, rules: ScoringRules): boolean {
  if (!isOptionalDeciderContext(state, rules)) return false;
  const { official } = splitOfficialAndSupplementalSets(state.sets);
  const idx = official.length - 1;
  const row = state.sets[idx];
  if (row.teamA > 0 || row.teamB > 0) return false;
  if (row.isTieBreak) return true;
  const c = state.classic;
  if (!c || state.activeSetIndex !== idx) return false;
  if (c.withinSetTieBreak) return false;
  const ps = c.pointState;
  return ps.kind === 'regular' && ps.teamA === 0 && ps.teamB === 0;
}

export const applyOptionalDeciderFormat = (
  input: LiveScoringState,
  rules: ScoringRules,
  format: LiveOptionalDeciderFormat
): LiveScoringActionResult => {
  if (!deciderRowPristineForOptionalChoice(input, rules)) return { state: input, changed: false };
  const state = cloneState(input);
  const { official } = splitOfficialAndSupplementalSets(state.sets);
  const idx = official.length - 1;
  const isTb = format === 'SUPER_TIEBREAK';
  state.sets[idx] = { ...state.sets[idx], isTieBreak: isTb };
  state.optionalDeciderFormat = format;
  if (state.classic && state.activeSetIndex === idx) {
    state.classic = syncClassicTieBreakForActiveSet(emptyClassic(), state.sets, idx, rules);
  }
  return { state, changed: true };
};

export const freezeTimedClassicSetAtPartialScore = (
  input: LiveScoringState,
  rules: ScoringRules
): LiveScoringActionResult => {
  if (!rules.allowIncompleteRegularSetGames || input.mode !== 'classic') return { state: input, changed: false };
  if (input.timedClassicSetLocked) return { state: input, changed: false };
  if (activeSetIsSuperTieBreak(input)) return { state: input, changed: false };
  const c = input.classic;
  if (c?.withinSetTieBreak) return { state: input, changed: false };
  const set = input.sets[input.activeSetIndex];
  if (!set) return { state: input, changed: false };
  const hasGameProgress = set.teamA > 0 || set.teamB > 0;
  const hasPointProgress =
    c &&
    (c.pointState.kind !== 'regular' ||
      c.pointState.teamA > 0 ||
      c.pointState.teamB > 0 ||
      c.withinSetTieBreak);
  if (!hasGameProgress && !hasPointProgress) return { state: input, changed: false };
  const state = cloneState(input);
  state.timedClassicSetLocked = true;
  if (state.classic && !activeSetIsSuperTieBreak(state)) {
    state.classic = {
      ...state.classic,
      pointState: { kind: 'regular', teamA: 0, teamB: 0 },
      classicPointsPlayedInGame: 0,
      withinSetTieBreak: false,
      tieBreakA: 0,
      tieBreakB: 0,
    };
  }
  return { state, changed: true };
};

export const clearTimedClassicSetLock = (input: LiveScoringState): LiveScoringActionResult => {
  if (!input.timedClassicSetLocked) return { state: input, changed: false };
  const state = cloneState(input);
  state.timedClassicSetLocked = undefined;
  return { state, changed: true };
};

const applyClassicPointsAfterUserScore = (state: LiveScoringState) => {
  const classic = state.classic;
  if (!classic || classic.withinSetTieBreak || activeSetIsSuperTieBreak(state)) return;
  const point = classic.pointState;
  if (point.kind === 'regular' && point.teamA === 0 && point.teamB === 0) {
    classic.classicPointsPlayedInGame = 0;
    return;
  }
  classic.classicPointsPlayedInGame += 1;
};

const applyClassicPointsAfterUnscore = (state: LiveScoringState) => {
  const classic = state.classic;
  if (!classic || classic.withinSetTieBreak || activeSetIsSuperTieBreak(state)) return;
  const point = classic.pointState;
  if (point.kind === 'regular' && point.teamA === 0 && point.teamB === 0) {
    classic.classicPointsPlayedInGame = 0;
    return;
  }
  if (point.kind === 'regular' && point.teamA === 40 && point.teamB === 40) {
    classic.classicPointsPlayedInGame = Math.max(8, classic.classicPointsPlayedInGame - 1);
    return;
  }
  classic.classicPointsPlayedInGame = Math.max(0, classic.classicPointsPlayedInGame - 1);
};

const gamesScoreForTieBreak = (rules: ScoringRules): number => rules.tieBreakGameAtGames ?? (rules.gamesPerSet || 6);
const tieBreakTarget = (rules: ScoringRules): number => rules.tieBreakGameFirstTo || 7;
const superTieBreakTarget = (rules: ScoringRules): number => rules.superTieBreakFirstTo || 10;
const nonNegativeInt = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
const isPoint = (value: unknown): value is LivePointValue => value === 0 || value === 15 || value === 30 || value === 40;
