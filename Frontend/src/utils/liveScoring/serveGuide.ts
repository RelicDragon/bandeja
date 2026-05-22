import type { ScoringRules } from '@/utils/scoring';
import { isClassicRules, isPointsRules, isRallyGameRules, isRallyPointsRules } from '@/utils/scoring';

const usesRallyCapPointsMode = (rules: ScoringRules): boolean =>
  isPointsRules(rules) || isRallyPointsRules(rules) || isRallyGameRules(rules);
import { isSupplementalMatchSet } from '@/utils/matchSetRole';
import type { LivePointsServeRotation, LiveScoringState, LiveTeamSide } from './types';

export type CourtServeSide = 'rightDeuce' | 'leftAd';

export type TieBreakServeSlot = 'serveOne' | 'serveTwo';

export type ServeGuideSnapshot = {
  serverTeam: LiveTeamSide;
  serverPlayerIndex: number;
  serverDisplayName: string;
  courtSide: CourtServeSide;
  tieBreakServeSlot: TieBreakServeSlot | null;
  changeEndsBeforeNextPoint: boolean;
  /** Team A at diagram bottom when false; swapped after each change of ends in the match so far. */
  courtEndsSwapped: boolean;
  courtTeamASidesMirrored: boolean;
  courtTeamBSidesMirrored: boolean;
  motionToken: string;
};

/** Odd change-of-ends blocks (6, 18, … points) within a single TB-style segment. */
export function courtEndsSwappedAfterPoints(totalPointsInSegment: number): boolean {
  return Math.floor(totalPointsInSegment / 6) % 2 === 1;
}

/**
 * Top/bottom parity from change-of-ends events so far:
 * classic odd games & even game-count set boundaries; plus every 6 points in `segmentPointCount`.
 */
export function courtEndsSwappedFromHistory(state: LiveScoringState, segmentPointCount = 0): boolean {
  let swapped = false;

  for (let si = 0; si < state.sets.length; si += 1) {
    if (si > state.activeSetIndex) break;
    const row = state.sets[si];
    if (!row || isSupplementalMatchSet(row) || row.isTieBreak) continue;

    const isActive = si === state.activeSetIndex;
    const gamesCompleted = (row.teamA ?? 0) + (row.teamB ?? 0);

    for (let g = 0; g < gamesCompleted; g += 1) {
      if ((g + 1) % 2 === 1) swapped = !swapped;
    }

    if (!isActive && gamesCompleted > 0 && gamesCompleted % 2 === 0) {
      swapped = !swapped;
    }
  }

  if (segmentPointCount > 0) {
    const tbBlocks = Math.floor(segmentPointCount / 6);
    if (tbBlocks % 2 === 1) swapped = !swapped;
  }

  return swapped;
}

/** Match-start bench anchor XOR change-of-ends parity for court diagram / serve arrow. */
export function effectiveCourtEndsSwapped(
  state: LiveScoringState,
  segmentPointCount = 0,
  pointsSegmentOnly = false
): boolean {
  const anchored = state.matchStartCourtEndsSwapped === true;
  const history = pointsSegmentOnly
    ? courtEndsSwappedAfterPoints(segmentPointCount)
    : courtEndsSwappedFromHistory(state, segmentPointCount);
  return anchored !== history;
}

export function effectiveCourtTeamASidesMirrored(state: LiveScoringState): boolean {
  return state.matchStartTeamASidesMirrored === true;
}

export function effectiveCourtTeamBSidesMirrored(state: LiveScoringState): boolean {
  return state.matchStartTeamBSidesMirrored === true;
}

function courtDiagramOrientation(
  state: LiveScoringState,
  segmentPointCount = 0,
  pointsSegmentOnly = false
): Pick<ServeGuideSnapshot, 'courtEndsSwapped' | 'courtTeamASidesMirrored' | 'courtTeamBSidesMirrored'> {
  return {
    courtEndsSwapped: effectiveCourtEndsSwapped(state, segmentPointCount, pointsSegmentOnly),
    courtTeamASidesMirrored: effectiveCourtTeamASidesMirrored(state),
    courtTeamBSidesMirrored: effectiveCourtTeamBSidesMirrored(state),
  };
}

/** When the next classic point starts a game or set that requires changing ends. */
export function changeEndsBeforeNextPointClassic(state: LiveScoringState, segmentPointCount = 0): boolean {
  if (segmentPointCount > 0) {
    return segmentPointCount > 0 && segmentPointCount % 6 === 0;
  }

  const c = state.classic;
  if (!c || c.classicPointsPlayedInGame > 0 || c.withinSetTieBreak) return false;

  const set = activeSetRow(state);
  if (!set || set.isTieBreak) return false;

  const completedGames = (set.teamA ?? 0) + (set.teamB ?? 0);
  if (completedGames > 0 && completedGames % 2 === 1) return true;

  if (completedGames === 0 && state.activeSetIndex > 0) {
    const prev = state.sets[state.activeSetIndex - 1];
    if (prev && !isSupplementalMatchSet(prev) && !prev.isTieBreak) {
      const prevTotal = (prev.teamA ?? 0) + (prev.teamB ?? 0);
      return prevTotal > 0 && prevTotal % 2 === 0;
    }
  }

  return false;
}

function otherTeam(t: LiveTeamSide): LiveTeamSide {
  return t === 'teamA' ? 'teamB' : 'teamA';
}

export function firstServerTeamForSet(
  setIndex: number,
  sets: LiveScoringState['sets'],
  matchFirstServer: LiveTeamSide
): LiveTeamSide {
  if (setIndex <= 0) return matchFirstServer;
  let j = setIndex - 1;
  while (j >= 0) {
    const row = sets[j];
    if (!row || isSupplementalMatchSet(row)) {
      j -= 1;
      continue;
    }
    const ta = row.teamA ?? 0;
    const tb = row.teamB ?? 0;
    const total = ta + tb;
    if (total > 0) {
      const prevFirst = firstServerTeamForSet(j, sets, matchFirstServer);
      const lastServer = row.isTieBreak
        ? tbNextServerTeam(prevFirst, total - 1)
        : servingTeamForGame(prevFirst, total - 1);
      return otherTeam(lastServer);
    }
    j -= 1;
  }
  return matchFirstServer;
}

export function servingTeamForGame(firstServerInSet: LiveTeamSide, completedGamesBeforeThisGame: number): LiveTeamSide {
  return completedGamesBeforeThisGame % 2 === 0 ? firstServerInSet : otherTeam(firstServerInSet);
}

export function tbNextServerTeam(firstTBTeam: LiveTeamSide, pointIndex: number): LiveTeamSide {
  if (pointIndex === 0) return firstTBTeam;
  const seg = Math.floor((pointIndex - 1) / 2);
  return seg % 2 === 0 ? otherTeam(firstTBTeam) : firstTBTeam;
}

export function tieBreakServeSlotAtPoint(pointIndex: number): TieBreakServeSlot {
  if (pointIndex === 0) return 'serveOne';
  return (pointIndex - 1) % 2 === 0 ? 'serveOne' : 'serveTwo';
}

/** Service court alternates every tie-break point (deuce → ad → …). */
export function courtSideForTieBreakPoint(pointIndex: number): CourtServeSide {
  return pointIndex % 2 === 0 ? 'rightDeuce' : 'leftAd';
}

export function doublesPlayerIndex(
  matchFirst: LiveTeamSide,
  matchFirstPlayerIdx: number,
  servingTeam: LiveTeamSide,
  completedGamesInSet: number
): number {
  if (servingTeam === matchFirst) {
    const nth = Math.floor(completedGamesInSet / 2);
    return (matchFirstPlayerIdx + nth) % 2;
  }
  const nth = Math.floor((completedGamesInSet - 1) / 2);
  return nth % 2;
}

export function needsPointsServeRotationChoice(state: LiveScoringState, rules: ScoringRules): boolean {
  if (state.mode === 'points' && usesRallyCapPointsMode(rules)) return true;
  if (state.mode === 'classic' && isClassicRules(rules) && activeSetIsSuperTieBreak(state)) return true;
  return false;
}

function simpleTeamServingAtPoint(firstForSet: LiveTeamSide, pointIndex: number, doubles: boolean): LiveTeamSide {
  const cycle = doubles ? 4 : 2;
  const block = Math.floor(pointIndex / cycle) % 2;
  return block === 0 ? firstForSet : otherTeam(firstForSet);
}

function simpleDoublesPlayerIndex(
  matchFirst: LiveTeamSide,
  matchFirstPlayerIdx: number,
  servingTeam: LiveTeamSide,
  pointIndex: number,
  doubles: boolean
): number {
  if (!doubles) return 0;
  const posInCycle = pointIndex % 4;
  const playerSlot = Math.floor(posInCycle / 2);
  if (servingTeam === matchFirst) return (matchFirstPlayerIdx + playerSlot) % 2;
  return playerSlot % 2;
}

export function firstServerForPointsSetSimple(
  setIndex: number,
  sets: LiveScoringState['sets'],
  matchFirstServer: LiveTeamSide,
  doubles: boolean
): LiveTeamSide {
  if (setIndex <= 0) return matchFirstServer;
  let j = setIndex - 1;
  while (j >= 0) {
    const row = sets[j];
    if (!row || isSupplementalMatchSet(row)) {
      j -= 1;
      continue;
    }
    const total = (row.teamA ?? 0) + (row.teamB ?? 0);
    if (total > 0) {
      const prevFirst = firstServerForPointsSetSimple(j, sets, matchFirstServer, doubles);
      return simpleTeamServingAtPoint(prevFirst, total, doubles);
    }
    j -= 1;
  }
  return matchFirstServer;
}

export function tbDoublesPlayerIndex(
  matchFirst: LiveTeamSide,
  matchFirstPlayerIdx: number,
  nextServingTeam: LiveTeamSide,
  pointIndex: number,
  gamesCompletedBeforeTB: number
): number {
  const base = doublesPlayerIndex(
    matchFirst,
    matchFirstPlayerIdx,
    nextServingTeam,
    Math.max(0, gamesCompletedBeforeTB)
  );
  if (pointIndex <= 1) return base;
  const turn = Math.floor((pointIndex - 1) / 2);
  return (base + turn) % 2;
}

function playerDisplay(names: string[], index: number): string {
  if (!names.length) return '—';
  return names[index] ?? names[0] ?? '—';
}

function gaPlusGbAtTieBreakEntry(state: LiveScoringState): number {
  const set = state.sets[state.activeSetIndex];
  return (set?.teamA ?? 0) + (set?.teamB ?? 0);
}

function activeSetRow(state: LiveScoringState) {
  return state.sets[state.activeSetIndex];
}

export function activeSetIsSuperTieBreak(state: LiveScoringState): boolean {
  return Boolean(activeSetRow(state)?.isTieBreak);
}

export function activeSetIsSupplemental(state: LiveScoringState): boolean {
  const row = activeSetRow(state);
  return row ? isSupplementalMatchSet(row) : false;
}

export function isPristineGameStart(state: LiveScoringState): boolean {
  const c = state.classic;
  if (!c || c.withinSetTieBreak) return false;
  const set = activeSetRow(state);
  if (!set || set.isTieBreak) return false;
  if (isSupplementalMatchSet(set)) return false;
  if ((set.teamA ?? 0) !== 0 || (set.teamB ?? 0) !== 0) return false;
  const ps = c.pointState;
  if (ps.kind !== 'regular' || ps.teamA !== 0 || ps.teamB !== 0) return false;
  if (c.classicPointsPlayedInGame !== 0) return false;
  return true;
}

export function isPristinePointsStart(state: LiveScoringState): boolean {
  if (state.mode !== 'points') return false;
  const set = activeSetRow(state);
  if (!set || isSupplementalMatchSet(set)) return false;
  return (set.teamA ?? 0) === 0 && (set.teamB ?? 0) === 0;
}

/** Super tie-break decider row at 0–0 (regular-game pristine checks exclude `isTieBreak`). */
export function isPristineSuperTieBreakStart(state: LiveScoringState): boolean {
  if (state.mode !== 'classic') return false;
  const set = activeSetRow(state);
  if (!set?.isTieBreak || isSupplementalMatchSet(set)) return false;
  return (set.teamA ?? 0) === 0 && (set.teamB ?? 0) === 0;
}

export function officialSetsHavePlay(state: LiveScoringState): boolean {
  return state.sets.some((s) => !isSupplementalMatchSet(s) && ((s.teamA ?? 0) > 0 || (s.teamB ?? 0) > 0));
}

function classicActiveSetHasPlay(state: LiveScoringState): boolean {
  const set = activeSetRow(state);
  if (!set || isSupplementalMatchSet(set)) return false;
  if ((set.teamA ?? 0) > 0 || (set.teamB ?? 0) > 0) return true;
  const c = state.classic;
  if (!c) return false;
  if (c.withinSetTieBreak && (c.tieBreakA > 0 || c.tieBreakB > 0)) return true;
  if (set.isTieBreak && ((set.teamA ?? 0) > 0 || (set.teamB ?? 0) > 0)) return true;
  const ps = c.pointState;
  if (ps.kind !== 'regular' || ps.teamA !== 0 || ps.teamB !== 0) return true;
  if (c.classicPointsPlayedInGame > 0) return true;
  return false;
}

/** First server for a points-cap official set (multi-set aware). */
export function firstServerForPointsSet(
  setIndex: number,
  sets: LiveScoringState['sets'],
  matchFirstServer: LiveTeamSide
): LiveTeamSide {
  if (setIndex <= 0) return matchFirstServer;
  let j = setIndex - 1;
  while (j >= 0) {
    const row = sets[j];
    if (!row || isSupplementalMatchSet(row)) {
      j -= 1;
      continue;
    }
    const ta = row.teamA ?? 0;
    const tb = row.teamB ?? 0;
    const total = ta + tb;
    if (total > 0) {
      const prevFirst = firstServerForPointsSet(j, sets, matchFirstServer);
      const lastServer = tbNextServerTeam(prevFirst, total - 1);
      return otherTeam(lastServer);
    }
    j -= 1;
  }
  return matchFirstServer;
}

export function needsServeSetup(state: LiveScoringState, rules: ScoringRules): boolean {
  if (state.serveGuideSkipped || state.firstServerTeam != null) return false;
  if (usesRallyCapPointsMode(rules) && state.mode === 'points') {
    return isPristinePointsStart(state) || officialSetsHavePlay(state);
  }
  if (isClassicRules(rules) && state.mode === 'classic') {
    return (
      isPristineGameStart(state) ||
      isPristineSuperTieBreakStart(state) ||
      classicActiveSetHasPlay(state) ||
      officialSetsHavePlay(state)
    );
  }
  return false;
}

export function computeServeGuideSnapshot(
  state: LiveScoringState,
  rules: ScoringRules,
  teamAPlayerNames: string[],
  teamBPlayerNames: string[],
  matchDoubles: boolean
): ServeGuideSnapshot | null {
  if (state.serveGuideSkipped) return null;
  const first = state.firstServerTeam;
  if (!first) return null;
  if (activeSetIsSupplemental(state)) return null;

  const rotation: LivePointsServeRotation = state.pointsServeRotation ?? 'official';

  if (state.mode === 'points' && usesRallyCapPointsMode(rules)) {
    return rotation === 'simple'
      ? simplePointsStrip(state, first, teamAPlayerNames, teamBPlayerNames, matchDoubles)
      : pointsCapStrip(state, first, teamAPlayerNames, teamBPlayerNames, matchDoubles);
  }

  if (!isClassicRules(rules) || state.mode !== 'classic') return null;

  const c = state.classic;
  if (!c) return null;

  if (activeSetIsSuperTieBreak(state)) {
    return rotation === 'simple'
      ? simplePointsStrip(state, first, teamAPlayerNames, teamBPlayerNames, matchDoubles)
      : superTieBreakStrip(state, first, teamAPlayerNames, teamBPlayerNames, matchDoubles);
  }
  if (c.withinSetTieBreak) {
    return withinTieBreakStrip(state, first, teamAPlayerNames, teamBPlayerNames, matchDoubles);
  }
  return classicGameStrip(state, first, teamAPlayerNames, teamBPlayerNames, matchDoubles);
}

function simplePointsStrip(
  state: LiveScoringState,
  matchFirst: LiveTeamSide,
  teamAPlayerNames: string[],
  teamBPlayerNames: string[],
  matchDoubles: boolean
): ServeGuideSnapshot | null {
  const set = activeSetRow(state);
  if (!set) return null;
  const ta = set.teamA ?? 0;
  const tb = set.teamB ?? 0;
  const t = ta + tb;
  const namesForTeamA = teamAPlayerNames;
  const namesForTeamB = teamBPlayerNames;
  const doubles = matchDoubles;
  const firstForSet =
    state.mode === 'points'
      ? firstServerForPointsSetSimple(state.activeSetIndex, state.sets, matchFirst, doubles)
      : firstServerTeamForSet(state.activeSetIndex, state.sets, matchFirst);
  const nextTeam = simpleTeamServingAtPoint(firstForSet, t, doubles);
  const namesForTeam = nextTeam === 'teamA' ? namesForTeamA : namesForTeamB;
  const matchFirstPlayerIdx = state.firstServerDoublesPlayerIndex ?? 0;
  const playerIdx = simpleDoublesPlayerIndex(matchFirst, matchFirstPlayerIdx, nextTeam, t, doubles);
  const display = doubles ? playerDisplay(namesForTeam, playerIdx) : namesForTeam[0] ?? '—';
  const side: CourtServeSide = t % 2 === 0 ? 'rightDeuce' : 'leftAd';
  const token = `pts-simple-${t}-${nextTeam}-${playerIdx}-${state.activeSetIndex}`;
  return {
    serverTeam: nextTeam,
    serverPlayerIndex: playerIdx,
    serverDisplayName: display,
    courtSide: side,
    tieBreakServeSlot: null,
    changeEndsBeforeNextPoint: false,
    ...courtDiagramOrientation(state, t),
    motionToken: token,
  };
}

function pointsCapStrip(
  state: LiveScoringState,
  matchFirst: LiveTeamSide,
  teamAPlayerNames: string[],
  teamBPlayerNames: string[],
  matchDoubles: boolean
): ServeGuideSnapshot | null {
  const set = activeSetRow(state);
  if (!set) return null;
  const ta = set.teamA ?? 0;
  const tb = set.teamB ?? 0;
  const t = ta + tb;
  const firstForSet = firstServerForPointsSet(state.activeSetIndex, state.sets, matchFirst);
  const nextTeam = tbNextServerTeam(firstForSet, t);
  const namesForTeam = nextTeam === 'teamA' ? teamAPlayerNames : teamBPlayerNames;
  const matchFirstPlayerIdx = state.firstServerDoublesPlayerIndex ?? 0;
  const playerIdx = matchDoubles
    ? tbDoublesPlayerIndex(matchFirst, matchFirstPlayerIdx, nextTeam, t, 0)
    : 0;
  const display = matchDoubles ? playerDisplay(namesForTeam, playerIdx) : namesForTeam[0] ?? '—';
  const slot = tieBreakServeSlotAtPoint(t);
  const side = courtSideForTieBreakPoint(t);
  const changeEnds = t > 0 && t % 6 === 0;
  const token = `pts-${t}-${nextTeam}-${playerIdx}-${state.activeSetIndex}`;
  return {
    serverTeam: nextTeam,
    serverPlayerIndex: playerIdx,
    serverDisplayName: display,
    courtSide: side,
    tieBreakServeSlot: slot,
    changeEndsBeforeNextPoint: changeEnds,
    ...courtDiagramOrientation(state, t, true),
    motionToken: token,
  };
}

function classicGameStrip(
  state: LiveScoringState,
  matchFirst: LiveTeamSide,
  teamAPlayerNames: string[],
  teamBPlayerNames: string[],
  matchDoubles: boolean
): ServeGuideSnapshot | null {
  const set = activeSetRow(state);
  const ga = set?.teamA ?? 0;
  const gb = set?.teamB ?? 0;
  const c = state.classic;
  if (!c) return null;
  const firstForSet = firstServerTeamForSet(state.activeSetIndex, state.sets, matchFirst);
  const completedGames = ga + gb;
  const servingTeam = servingTeamForGame(firstForSet, completedGames);
  const matchFirstPlayerIdx = state.firstServerDoublesPlayerIndex ?? 0;
  const playerIdx = matchDoubles
    ? doublesPlayerIndex(matchFirst, matchFirstPlayerIdx, servingTeam, completedGames)
    : 0;
  const names = servingTeam === 'teamA' ? teamAPlayerNames : teamBPlayerNames;
  const display = matchDoubles ? playerDisplay(names, playerIdx) : names[0] ?? '—';
  const side: CourtServeSide = c.classicPointsPlayedInGame % 2 === 0 ? 'rightDeuce' : 'leftAd';
  const token = `${servingTeam}-${playerIdx}-${c.classicPointsPlayedInGame}-${ga}-${gb}`;
  return {
    serverTeam: servingTeam,
    serverPlayerIndex: playerIdx,
    serverDisplayName: display,
    courtSide: side,
    tieBreakServeSlot: null,
    changeEndsBeforeNextPoint: changeEndsBeforeNextPointClassic(state),
    ...courtDiagramOrientation(state),
    motionToken: token,
  };
}

function withinTieBreakStrip(
  state: LiveScoringState,
  matchFirst: LiveTeamSide,
  teamAPlayerNames: string[],
  teamBPlayerNames: string[],
  matchDoubles: boolean
): ServeGuideSnapshot | null {
  const set = activeSetRow(state);
  const ga = set?.teamA ?? 0;
  const gb = set?.teamB ?? 0;
  const c = state.classic;
  if (!c) return null;
  const firstForSet = firstServerTeamForSet(state.activeSetIndex, state.sets, matchFirst);
  const completedGames = ga + gb;
  const firstTBTeam = servingTeamForGame(firstForSet, completedGames);
  const t = c.tieBreakA + c.tieBreakB;
  const nextTeam = tbNextServerTeam(firstTBTeam, t);
  const namesForTeam = nextTeam === 'teamA' ? teamAPlayerNames : teamBPlayerNames;
  const matchFirstPlayerIdx = state.firstServerDoublesPlayerIndex ?? 0;
  const playerIdx = matchDoubles
    ? tbDoublesPlayerIndex(
        matchFirst,
        matchFirstPlayerIdx,
        nextTeam,
        t,
        gaPlusGbAtTieBreakEntry(state)
      )
    : 0;
  const display = matchDoubles ? playerDisplay(namesForTeam, playerIdx) : namesForTeam[0] ?? '—';
  const slot = tieBreakServeSlotAtPoint(t);
  const side = courtSideForTieBreakPoint(t);
  const token = `wtb-${t}-${nextTeam}-${playerIdx}`;
  return {
    serverTeam: nextTeam,
    serverPlayerIndex: playerIdx,
    serverDisplayName: display,
    courtSide: side,
    tieBreakServeSlot: slot,
    changeEndsBeforeNextPoint: changeEndsBeforeNextPointClassic(state, t),
    ...courtDiagramOrientation(state, t),
    motionToken: token,
  };
}

function superTieBreakStrip(
  state: LiveScoringState,
  matchFirst: LiveTeamSide,
  teamAPlayerNames: string[],
  teamBPlayerNames: string[],
  matchDoubles: boolean
): ServeGuideSnapshot | null {
  const set = activeSetRow(state);
  const ta = set?.teamA ?? 0;
  const tb = set?.teamB ?? 0;
  const c = state.classic;
  if (!c) return null;
  const firstForSet = firstServerTeamForSet(state.activeSetIndex, state.sets, matchFirst);
  const firstTBTeam = firstForSet;
  const t = ta + tb;
  const nextTeam = tbNextServerTeam(firstTBTeam, t);
  const namesForTeam = nextTeam === 'teamA' ? teamAPlayerNames : teamBPlayerNames;
  const matchFirstPlayerIdx = state.firstServerDoublesPlayerIndex ?? 0;
  const playerIdx = matchDoubles
    ? tbDoublesPlayerIndex(matchFirst, matchFirstPlayerIdx, nextTeam, t, 0)
    : 0;
  const display = matchDoubles ? playerDisplay(namesForTeam, playerIdx) : namesForTeam[0] ?? '—';
  const slot = tieBreakServeSlotAtPoint(t);
  const side = courtSideForTieBreakPoint(t);
  const token = `stb-${t}-${nextTeam}`;
  return {
    serverTeam: nextTeam,
    serverPlayerIndex: playerIdx,
    serverDisplayName: display,
    courtSide: side,
    tieBreakServeSlot: slot,
    changeEndsBeforeNextPoint: changeEndsBeforeNextPointClassic(state, t),
    ...courtDiagramOrientation(state, t),
    motionToken: token,
  };
}
