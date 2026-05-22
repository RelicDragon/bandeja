import type { CourtServeSide } from './serveGuide';

/** BWF: even score → right service court, odd → left. */
export function badmintonCourtSideForServerScore(serverScore: number): CourtServeSide {
  return serverScore % 2 === 0 ? 'rightDeuce' : 'leftAd';
}

/** Mid-game interval when the leading score reaches 11 (21-pt) or 8 (15-pt) games. */
export function badmintonChangeEndsBeforeNextPoint(
  teamAScore: number,
  teamBScore: number,
  pointsPerGame: number
): boolean {
  const intervalAt = pointsPerGame >= 21 ? 11 : pointsPerGame >= 15 ? 8 : 6;
  const max = Math.max(teamAScore, teamBScore);
  const min = Math.min(teamAScore, teamBScore);
  return max === intervalAt && min < intervalAt;
}
