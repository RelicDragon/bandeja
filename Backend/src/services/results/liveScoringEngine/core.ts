import type { ScoringRules } from './rulebook';
import { isClassicRules } from './rulebook';
import type {
  LiveClassicPointState,
  LivePointValue,
  LiveScoringActionResult,
  LiveScoringClassicState,
  LiveScoringState,
  LiveTeamSide,
  SetResult,
} from './types';

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
  return {
    activeSetIndex: 0,
    mode,
    sets: normalizeSets(sets),
    classic: mode === 'classic' ? syncClassicTieBreakForActiveSet(emptyClassic(), normalizeSets(sets), 0, rules) : undefined,
  };
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
  return {
    activeSetIndex,
    mode,
    sets,
    classic,
    firstServerTeam: o.firstServerTeam === 'teamA' || o.firstServerTeam === 'teamB' ? o.firstServerTeam : undefined,
    firstServerDoublesPlayerIndex:
      typeof o.firstServerDoublesPlayerIndex === 'number' ? o.firstServerDoublesPlayerIndex : undefined,
    serveGuideSkipped: typeof o.serveGuideSkipped === 'boolean' ? o.serveGuideSkipped : undefined,
  };
};

export const scoreLivePoint = (
  input: LiveScoringState,
  side: LiveTeamSide,
  rules: ScoringRules,
  options: { confirmGameWin?: boolean } = {}
): LiveScoringActionResult => {
  const state = cloneState(input);
  ensureSetExists(state);

  if (state.mode !== 'classic') {
    state.sets[state.activeSetIndex][side] = Math.min(99, state.sets[state.activeSetIndex][side] + 1);
    return { state, changed: true };
  }

  state.classic = state.classic ?? emptyClassic();
  state.classic.pendingGameWinConfirmSide = undefined;

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

  if (!options.confirmGameWin && tapWouldAwardCurrentGame(state.classic.pointState, side)) {
    state.classic.pendingGameWinConfirmSide = side;
    return { state, changed: true, needsGameWinConfirm: side };
  }

  applyClassicPoint(state, side, rules);
  applyClassicPointsAfterUserScore(state);
  return { state: autoAdvanceCompletedSets(state, rules), changed: true };
};

export const confirmPendingGameWin = (input: LiveScoringState, rules: ScoringRules): LiveScoringActionResult => {
  const side = input.classic?.pendingGameWinConfirmSide;
  if (!side) return { state: input, changed: false };
  return scoreLivePoint(input, side, rules, { confirmGameWin: true });
};

export const cancelPendingGameWin = (input: LiveScoringState): LiveScoringActionResult => {
  if (!input.classic?.pendingGameWinConfirmSide) return { state: input, changed: false };
  const state = cloneState(input);
  if (state.classic) state.classic.pendingGameWinConfirmSide = undefined;
  return { state, changed: true };
};

export const unscoreLivePoint = (
  input: LiveScoringState,
  side: LiveTeamSide,
  rules: ScoringRules
): LiveScoringActionResult => {
  const state = cloneState(input);
  ensureSetExists(state);

  if (state.mode !== 'classic') {
    const set = state.sets[state.activeSetIndex];
    if (set[side] <= 0) return { state: input, changed: false };
    set[side] -= 1;
    return { state, changed: true };
  }

  state.classic = state.classic ?? emptyClassic();
  state.classic.pendingGameWinConfirmSide = undefined;

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
  if (state.mode !== 'classic') return set.teamA > 0 || set.teamB > 0;
  if (set.isTieBreak) return pointRaceCompleted(set.teamA, set.teamB, superTieBreakTarget(rules), rules.superTieBreakWinBy);
  return classicSetCompleted(set.teamA, set.teamB, rules);
};

export const advanceLiveSet = (input: LiveScoringState, rules: ScoringRules): LiveScoringActionResult => {
  if (!canAdvanceLiveSet(input, rules)) return { state: input, changed: false };
  const state = cloneState(input);
  state.activeSetIndex += 1;
  ensureSetExists(state);
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
  return s;
}

export const getClassicPointLabels = (classic?: LiveScoringClassicState): { teamA: string; teamB: string; center: string } => {
  if (!classic) return { teamA: '0', teamB: '0', center: '' };
  if (classic.withinSetTieBreak) {
    return { teamA: String(classic.tieBreakA), teamB: String(classic.tieBreakB), center: 'Tie-break' };
  }
  const point = classic.pointState;
  if (point.kind === 'deuce') return { teamA: '40', teamB: '40', center: 'Deuce' };
  if (point.kind === 'advantage') {
    return { teamA: point.side === 'teamA' ? 'Ad' : '40', teamB: point.side === 'teamB' ? 'Ad' : '40', center: 'Advantage' };
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
      pointState: normalizePointState(o.pointState),
      withinSetTieBreak: typeof o.withinSetTieBreak === 'boolean' ? o.withinSetTieBreak : false,
      tieBreakA: nonNegativeInt(o.tieBreakA),
      tieBreakB: nonNegativeInt(o.tieBreakB),
      classicPointsPlayedInGame: nonNegativeInt(o.classicPointsPlayedInGame),
      pendingGameWinConfirmSide:
        o.pendingGameWinConfirmSide === 'teamA' || o.pendingGameWinConfirmSide === 'teamB'
          ? o.pendingGameWinConfirmSide
          : undefined,
    },
    sets,
    activeSetIndex,
    rules
  );
};

const normalizePointState = (raw: unknown): LiveClassicPointState => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { kind: 'regular', teamA: 0, teamB: 0 };
  const o = raw as Partial<LiveClassicPointState>;
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

const ensureSetExists = (state: LiveScoringState) => {
  while (state.sets.length <= state.activeSetIndex) state.sets.push({ teamA: 0, teamB: 0 });
};

const applyClassicPoint = (state: LiveScoringState, side: LiveTeamSide, rules: ScoringRules) => {
  const classic = state.classic ?? emptyClassic();
  const point = classic.pointState;

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
  ensureSetExists(state);
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

const tapWouldAwardCurrentGame = (point: LiveClassicPointState, side: LiveTeamSide): boolean => {
  if (point.kind === 'deuce') return false;
  if (point.kind === 'advantage') return point.side === side;
  if (side === 'teamA') return point.teamA === 40 && point.teamB !== 40;
  return point.teamB === 40 && point.teamA !== 40;
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

const classicSetCompleted = (teamA: number, teamB: number, rules: ScoringRules): boolean => {
  const hi = Math.max(teamA, teamB);
  const lo = Math.min(teamA, teamB);
  const tbAt = gamesScoreForTieBreak(rules);
  if (hi === tbAt && lo === tbAt) return false;
  if (hi === tbAt + 1 && lo === tbAt) return true;
  return hi >= rules.gamesPerSet && hi - lo >= rules.winBy;
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
