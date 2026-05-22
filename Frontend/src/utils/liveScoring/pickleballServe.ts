import type { CourtServeSide, TieBreakServeSlot } from './serveGuide';

/** Even server score → right service court, odd → left (USAPA). */
export function pickleballCourtSideForServerScore(serverScore: number): CourtServeSide {
  return serverScore % 2 === 0 ? 'rightDeuce' : 'leftAd';
}

/** Switch sides when the leading score reaches 6 (11-pt) or 8 (15-pt) games. */
export function pickleballChangeEndsBeforeNextPoint(
  teamAScore: number,
  teamBScore: number,
  pointsPerGame: number
): boolean {
  const intervalAt = pointsPerGame >= 15 ? 8 : 6;
  const max = Math.max(teamAScore, teamBScore);
  const min = Math.min(teamAScore, teamBScore);
  return max === intervalAt && min < intervalAt;
}

/** Doubles: map roster server index to serve 1 / 2 badge. */
export function pickleballDoublesServeSlot(serverPlayerIndex: number): TieBreakServeSlot {
  return serverPlayerIndex === 0 ? 'serveOne' : 'serveTwo';
}

export function pickleballServeMotionToken(baseToken: string): string {
  return `pb-${baseToken}`;
}
