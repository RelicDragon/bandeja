import type { ScoringRules } from '@/utils/scoring';
import type { LiveScoringState, LiveTeamSide } from './types';
import type { CourtServeSide, TieBreakServeSlot } from './serveGuide';
import { tableTennisGamesWonBeforeActive, tableTennisIsDecidingGame } from './tableTennisServeGuide';

/** Even server score → right service court, odd → left (USAPA). */
export function pickleballCourtSideForServerScore(serverScore: number): CourtServeSide {
  return serverScore % 2 === 0 ? 'rightDeuce' : 'leftAd';
}

/** USAPA 5.B.3: midpoint at 6 (to 11), 8 (to 15), 11 (to 21). */
export function pickleballMidpointScore(pointsPerGame: number): number {
  if (pointsPerGame >= 21) return 11;
  if (pointsPerGame >= 15) return 8;
  return 6;
}

export function pickleballIsDecidingGame(
  state: LiveScoringState,
  rules: Pick<ScoringRules, 'fixedNumberOfSets' | 'totalPointsPerSet' | 'winBy'>
): boolean {
  return tableTennisIsDecidingGame(state, rules);
}

export { tableTennisGamesWonBeforeActive as pickleballGamesWonBeforeActive };

/** Mid-game interval reached (leader at midpoint, opponent below — not tied). */
export function pickleballMidGameEndsSwapped(
  teamAScore: number,
  teamBScore: number,
  pointsPerGame: number,
  isDecidingGame: boolean
): boolean {
  if (!isDecidingGame) return false;
  const intervalAt = pickleballMidpointScore(pointsPerGame);
  const max = Math.max(teamAScore, teamBScore);
  const min = Math.min(teamAScore, teamBScore);
  if (max < intervalAt) return false;
  if (max === intervalAt && min >= intervalAt) return false;
  return true;
}

/** 5.B.1 between games; 5.B.3/5.B.4 midpoint in deciding game only. */
export function pickleballChangeEndsBeforeNextPoint(
  teamAScore: number,
  teamBScore: number,
  pointsPerGame: number,
  opts?: { isDecidingGame?: boolean; activeSetIndex?: number; totalPointsInGame?: number }
): boolean {
  const activeSetIndex = opts?.activeSetIndex ?? 0;
  const totalPoints = opts?.totalPointsInGame ?? teamAScore + teamBScore;
  const isDeciding = opts?.isDecidingGame ?? true;

  if (totalPoints === 0 && activeSetIndex > 0) return true;
  if (!isDeciding) return false;

  const intervalAt = pickleballMidpointScore(pointsPerGame);
  const max = Math.max(teamAScore, teamBScore);
  const min = Math.min(teamAScore, teamBScore);
  return max === intervalAt && min < intervalAt;
}

/** Alternate ends each game; flip once after midpoint in the deciding game. */
export function pickleballCourtEndsSwapped(
  state: LiveScoringState,
  teamAScore: number,
  teamBScore: number,
  rules: Pick<ScoringRules, 'fixedNumberOfSets' | 'totalPointsPerSet' | 'winBy'>
): boolean {
  const anchored = state.matchStartCourtEndsSwapped === true;
  const isDeciding = pickleballIsDecidingGame(state, rules);
  const betweenGameFlips = state.activeSetIndex % 2 === 1;
  const midGameFlip = pickleballMidGameEndsSwapped(teamAScore, teamBScore, rules.totalPointsPerSet, isDeciding);
  const flips = betweenGameFlips !== midGameFlip;
  return anchored !== flips;
}

/** Rally scoring: last rally winner serves next. */
export function pickleballNextServerTeam(
  state: Pick<LiveScoringState, 'pointWinnerLog'>,
  firstForSet: LiveTeamSide
): LiveTeamSide {
  const log = state.pointWinnerLog ?? [];
  return log.length > 0 ? log[log.length - 1]! : firstForSet;
}

function sideOutServerIndex(
  serverTeam: LiveTeamSide,
  teamScore: number,
  matchFirst: LiveTeamSide,
  matchFirstPlayerIdx: number
): number {
  const serveRight = teamScore % 2 === 0;
  if (serveRight) {
    if (serverTeam === matchFirst && teamScore === 0) return matchFirstPlayerIdx;
    return 0;
  }
  return 1;
}

/** Doubles: replay side-outs from this game's first server; serving team keeps partner until side out. */
export function pickleballDoublesPlayerIndex(
  state: Pick<LiveScoringState, 'pointWinnerLog'>,
  firstForSet: LiveTeamSide,
  matchFirst: LiveTeamSide,
  matchFirstPlayerIdx: number,
  ta: number,
  tb: number
): number {
  const log = state.pointWinnerLog ?? [];
  const serverTeam = log.length > 0 ? log[log.length - 1]! : firstForSet;
  const teamScore = serverTeam === 'teamA' ? ta : tb;

  if (log.length === 0) {
    return sideOutServerIndex(serverTeam, teamScore, matchFirst, matchFirstPlayerIdx);
  }

  let a = 0;
  let b = 0;
  let currentServer = firstForSet;
  let serverIdx = sideOutServerIndex(firstForSet, 0, matchFirst, matchFirstPlayerIdx);

  for (const winner of log) {
    if (winner === 'teamA') a += 1;
    else b += 1;
    if (winner === currentServer) continue;
    currentServer = winner;
    const score = currentServer === 'teamA' ? a : b;
    serverIdx = sideOutServerIndex(currentServer, score, matchFirst, matchFirstPlayerIdx);
  }
  return serverIdx;
}

/** Rally-scoring doubles: no server 1/2 badge (USAPA 4.J.1). */
export function pickleballDoublesServeSlot(_serverPlayerIndex: number): TieBreakServeSlot | null {
  return null;
}

export function pickleballServeMotionToken(baseToken: string): string {
  return `pb-${baseToken}`;
}
