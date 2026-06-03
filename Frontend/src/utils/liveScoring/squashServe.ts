import type { LiveScoringState, LiveTeamSide } from './types';
import type { CourtServeSide } from './serveGuide';

/** WSF: even server score → right box, odd → left (facing front wall). */
export function squashCourtSideForServerScore(serverScore: number): CourtServeSide {
  return serverScore % 2 === 0 ? 'rightDeuce' : 'leftAd';
}

/** Court-absolute service box from serve side token. */
export function squashServiceBoxSide(courtSide: CourtServeSide): 'left' | 'right' {
  return courtSide === 'rightDeuce' ? 'right' : 'left';
}

/** Pre-match setup: first server always in the right service box (backRight). */
export function squashSetupCourtEndsSwappedForFirstServer(serverTeam: LiveTeamSide): boolean {
  return serverTeam === 'teamA';
}

/** WSF rally scoring: winner of the last point serves next. */
export function squashNextServerTeam(
  state: Pick<LiveScoringState, 'pointWinnerLog'>,
  firstForSet: LiveTeamSide
): LiveTeamSide {
  const log = state.pointWinnerLog ?? [];
  return log.length > 0 ? log[log.length - 1]! : firstForSet;
}

/** PAR: change ends when a player reaches 11, except at 11–10 (win-by-2 continues). */
export function squashChangeEndsBeforeNextPoint(teamAScore: number, teamBScore: number): boolean {
  const max = Math.max(teamAScore, teamBScore);
  const min = Math.min(teamAScore, teamBScore);
  return max === 11 && min < 10;
}

/** Mid-game interval at 11 has been reached (not the 11–10 deuce band). */
export function squashMidGameEndsSwapped(teamAScore: number, teamBScore: number): boolean {
  const max = Math.max(teamAScore, teamBScore);
  const min = Math.min(teamAScore, teamBScore);
  if (max < 11) return false;
  if (max === 11 && min >= 10) return false;
  return true;
}

/** Alternate ends each game; flip once after the mid-game interval at 11. */
export function squashCourtEndsSwapped(
  state: LiveScoringState,
  teamAScore: number,
  teamBScore: number
): boolean {
  const anchored = state.matchStartCourtEndsSwapped === true;
  const betweenGameFlips = state.activeSetIndex % 2 === 1;
  const midGameFlip = squashMidGameEndsSwapped(teamAScore, teamBScore);
  const flips = betweenGameFlips !== midGameFlip;
  return anchored !== flips;
}
