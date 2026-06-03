import type { LiveScoringState, LiveTeamSide } from './types';
import { courtSideForTieBreakPoint, tbNextServerTeam } from './serveGuide';
import type { ScoringRules } from '@/utils/scoring';

function otherTeam(team: LiveTeamSide): LiveTeamSide {
  return team === 'teamA' ? 'teamB' : 'teamA';
}

const DEUCE_MIN = 10;

export function tableTennisInDeuce(teamA: number, teamB: number): boolean {
  return teamA >= DEUCE_MIN && teamB >= DEUCE_MIN;
}

/** ITTF: two serves each until 10–10, then alternate every point. */
export function tableTennisNextServerTeam(
  firstForSet: LiveTeamSide,
  pointIndex: number,
  teamA: number,
  teamB: number
): LiveTeamSide {
  if (!tableTennisInDeuce(teamA, teamB)) {
    return tbNextServerTeam(firstForSet, pointIndex);
  }
  const deuceStart = tbNextServerTeam(firstForSet, DEUCE_MIN * 2);
  const offset = pointIndex - DEUCE_MIN * 2;
  return offset % 2 === 0 ? deuceStart : otherTeam(deuceStart);
}

/** Completed games (sets) won before the active game. */
export function tableTennisGamesWonBeforeActive(
  state: LiveScoringState,
  rules: Pick<ScoringRules, 'totalPointsPerSet' | 'winBy'>
): { teamA: number; teamB: number } {
  let teamA = 0;
  let teamB = 0;
  const cap = rules.totalPointsPerSet;
  const winBy = rules.winBy;
  for (let i = 0; i < state.activeSetIndex; i += 1) {
    const row = state.sets[i];
    if (!row) continue;
    const a = row.teamA ?? 0;
    const b = row.teamB ?? 0;
    const leader = Math.max(a, b);
    const trailer = Math.min(a, b);
    if (leader < cap || leader - trailer < winBy) continue;
    if (a > b) teamA += 1;
    else if (b > a) teamB += 1;
  }
  return { teamA, teamB };
}

/**
 * ITTF Law 2.14.3: mid-game change only in the deciding game of a match.
 * Single-game presets count as deciding.
 */
export function tableTennisIsDecidingGame(
  state: LiveScoringState,
  rules: Pick<ScoringRules, 'fixedNumberOfSets' | 'totalPointsPerSet' | 'winBy'>
): boolean {
  if (rules.fixedNumberOfSets <= 1) return true;
  const { teamA, teamB } = tableTennisGamesWonBeforeActive(state, rules);
  return teamA === teamB && teamA > 0;
}

/**
 * ITTF: change ends after each game (before first point of games 2+),
 * and once when total points reach 5 in the deciding game only.
 */
export function tableTennisChangeEndsBeforeNextPoint(
  pointIndex: number,
  activeSetIndex: number,
  isDecidingGame: boolean
): boolean {
  if (pointIndex === 0 && activeSetIndex > 0) return true;
  return isDecidingGame && pointIndex === 5;
}

/** Court flip: alternate each new game; + once at 5+ points in the deciding game. */
export function tableTennisCourtEndsSwapped(
  state: LiveScoringState,
  pointIndex: number,
  isDecidingGame: boolean
): boolean {
  const anchored = state.matchStartCourtEndsSwapped === true;
  const betweenGameFlips = state.activeSetIndex % 2 === 1;
  const midDeciderFlip = isDecidingGame && pointIndex >= 5;
  const flips = betweenGameFlips !== midDeciderFlip;
  return anchored !== flips;
}

/** Service court from total points in the game (even → right, odd → left). */
export function tableTennisCourtSide(pointIndex: number) {
  return courtSideForTieBreakPoint(pointIndex);
}
