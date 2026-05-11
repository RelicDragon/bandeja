import type { ScoringRules } from '@/utils/scoring';
import { isClassicRules } from '@/utils/scoring';
import { isSupplementalMatchSet } from '@/utils/matchSetRole';
import type { LiveScoringState, LiveTeamSide } from './types';

export type CourtServeSide = 'rightDeuce' | 'leftAd';

export type TieBreakServeSlot = 'serveOne' | 'serveTwo';

export type ServeGuideSnapshot = {
  serverTeam: LiveTeamSide;
  serverPlayerIndex: number;
  serverDisplayName: string;
  courtSide: CourtServeSide;
  tieBreakServeSlot: TieBreakServeSlot | null;
  changeEndsBeforeNextPoint: boolean;
  motionToken: string;
};

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
    const ta = row?.teamA ?? 0;
    const tb = row?.teamB ?? 0;
    if (ta > 0 || tb > 0) {
      const prevFirst = firstServerTeamForSet(j, sets, matchFirstServer);
      const lastIdx = ta + tb - 1;
      const lastServer = servingTeamForGame(prevFirst, lastIdx);
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

export function needsServeSetup(state: LiveScoringState, rules: ScoringRules): boolean {
  return (
    isClassicRules(rules) &&
    !state.serveGuideSkipped &&
    state.firstServerTeam == null &&
    isPristineGameStart(state)
  );
}

export function computeServeGuideSnapshot(
  state: LiveScoringState,
  rules: ScoringRules,
  teamAPlayerNames: string[],
  teamBPlayerNames: string[]
): ServeGuideSnapshot | null {
  if (!isClassicRules(rules) || state.mode !== 'classic') return null;
  if (state.serveGuideSkipped) return null;
  const first = state.firstServerTeam;
  if (!first) return null;
  if (activeSetIsSupplemental(state)) return null;

  const c = state.classic;
  if (!c) return null;

  if (activeSetIsSuperTieBreak(state)) {
    return superTieBreakStrip(state, first, teamAPlayerNames, teamBPlayerNames);
  }
  if (c.withinSetTieBreak) {
    return withinTieBreakStrip(state, first, teamAPlayerNames, teamBPlayerNames);
  }
  return classicGameStrip(state, first, teamAPlayerNames, teamBPlayerNames);
}

function classicGameStrip(
  state: LiveScoringState,
  matchFirst: LiveTeamSide,
  teamAPlayerNames: string[],
  teamBPlayerNames: string[]
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
  const playerIdx = doublesPlayerIndex(matchFirst, matchFirstPlayerIdx, servingTeam, completedGames);
  const names = servingTeam === 'teamA' ? teamAPlayerNames : teamBPlayerNames;
  const display = playerDisplay(names, playerIdx);
  const side: CourtServeSide = c.classicPointsPlayedInGame % 2 === 0 ? 'rightDeuce' : 'leftAd';
  const token = `${servingTeam}-${playerIdx}-${c.classicPointsPlayedInGame}-${ga}-${gb}`;
  return {
    serverTeam: servingTeam,
    serverPlayerIndex: playerIdx,
    serverDisplayName: display,
    courtSide: side,
    tieBreakServeSlot: null,
    changeEndsBeforeNextPoint: false,
    motionToken: token,
  };
}

function withinTieBreakStrip(
  state: LiveScoringState,
  matchFirst: LiveTeamSide,
  teamAPlayerNames: string[],
  teamBPlayerNames: string[]
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
  const doubles = namesForTeam.length >= 2;
  const matchFirstPlayerIdx = state.firstServerDoublesPlayerIndex ?? 0;
  const playerIdx = tbDoublesPlayerIndex(
    matchFirst,
    matchFirstPlayerIdx,
    nextTeam,
    t,
    gaPlusGbAtTieBreakEntry(state)
  );
  const display = doubles ? playerDisplay(namesForTeam, playerIdx) : namesForTeam[0] ?? '—';
  const side: CourtServeSide = t % 2 === 0 ? 'rightDeuce' : 'leftAd';
  const slot: TieBreakServeSlot | null = t === 0 ? 'serveOne' : (t - 1) % 2 === 0 ? 'serveOne' : 'serveTwo';
  const changeEnds = t > 0 && t % 6 === 0;
  const token = `wtb-${t}-${nextTeam}-${playerIdx}`;
  return {
    serverTeam: nextTeam,
    serverPlayerIndex: playerIdx,
    serverDisplayName: display,
    courtSide: side,
    tieBreakServeSlot: slot,
    changeEndsBeforeNextPoint: changeEnds,
    motionToken: token,
  };
}

function superTieBreakStrip(
  state: LiveScoringState,
  matchFirst: LiveTeamSide,
  teamAPlayerNames: string[],
  teamBPlayerNames: string[]
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
  const doubles = namesForTeam.length >= 2;
  const matchFirstPlayerIdx = state.firstServerDoublesPlayerIndex ?? 0;
  const playerIdx = tbDoublesPlayerIndex(matchFirst, matchFirstPlayerIdx, nextTeam, t, 0);
  const display = doubles ? playerDisplay(namesForTeam, playerIdx) : namesForTeam[0] ?? '—';
  const side: CourtServeSide = t % 2 === 0 ? 'rightDeuce' : 'leftAd';
  const slot: TieBreakServeSlot | null = t === 0 ? 'serveOne' : (t - 1) % 2 === 0 ? 'serveOne' : 'serveTwo';
  const changeEnds = t > 0 && t % 6 === 0;
  const token = `stb-${t}-${nextTeam}`;
  return {
    serverTeam: nextTeam,
    serverPlayerIndex: playerIdx,
    serverDisplayName: display,
    courtSide: side,
    tieBreakServeSlot: slot,
    changeEndsBeforeNextPoint: changeEnds,
    motionToken: token,
  };
}
