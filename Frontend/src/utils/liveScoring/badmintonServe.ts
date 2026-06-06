import type { LiveScoringState, LiveTeamSide } from './types';
import type { CourtServeSide } from './serveGuide';

/** BWF: even score → right service court, odd → left. */
export function badmintonCourtSideForServerScore(serverScore: number): CourtServeSide {
  return serverScore % 2 === 0 ? 'rightDeuce' : 'leftAd';
}

function badmintonIntervalAt(pointsPerGame: number): number {
  if (pointsPerGame >= 21) return 11;
  if (pointsPerGame >= 15) return 8;
  return 6;
}

/** Mid-game interval when the leading score reaches 11 (21-pt) or 8 (15-pt) games. */
export function badmintonChangeEndsBeforeNextPoint(
  teamAScore: number,
  teamBScore: number,
  pointsPerGame: number
): boolean {
  const intervalAt = badmintonIntervalAt(pointsPerGame);
  const max = Math.max(teamAScore, teamBScore);
  const min = Math.min(teamAScore, teamBScore);
  return max === intervalAt && min < intervalAt - 1;
}

/** Interval reached (not the deuce band at interval). */
export function badmintonMidGameEndsSwapped(
  teamAScore: number,
  teamBScore: number,
  pointsPerGame: number
): boolean {
  const intervalAt = badmintonIntervalAt(pointsPerGame);
  const max = Math.max(teamAScore, teamBScore);
  const min = Math.min(teamAScore, teamBScore);
  if (max < intervalAt) return false;
  if (max === intervalAt && min >= intervalAt - 1) return false;
  return true;
}

/** Alternate ends each game; flip once after the mid-game interval. */
export function badmintonCourtEndsSwapped(
  state: Pick<LiveScoringState, 'activeSetIndex' | 'matchStartCourtEndsSwapped'>,
  teamAScore: number,
  teamBScore: number,
  pointsPerGame: number
): boolean {
  const anchored = state.matchStartCourtEndsSwapped === true;
  const betweenGameFlips = state.activeSetIndex % 2 === 1;
  const midGameFlip = badmintonMidGameEndsSwapped(teamAScore, teamBScore, pointsPerGame);
  const flips = betweenGameFlips !== midGameFlip;
  return anchored !== flips;
}

/** BWF rally scoring: winner of the last point serves next. */
export function badmintonNextServerTeam(
  state: Pick<LiveScoringState, 'pointWinnerLog'>,
  firstForSet: LiveTeamSide
): LiveTeamSide {
  const log = state.pointWinnerLog ?? [];
  return log.length > 0 ? log[log.length - 1]! : firstForSet;
}

type BdServiceCourt = 'left' | 'right';

type BdTeamCourts = { p0: BdServiceCourt; p1: BdServiceCourt };

function badmintonInitialTeamCourts(isFirstServerTeam: boolean, firstPlayerIdx: number): BdTeamCourts {
  if (isFirstServerTeam) {
    return {
      p0: firstPlayerIdx === 0 ? 'right' : 'left',
      p1: firstPlayerIdx === 1 ? 'right' : 'left',
    };
  }
  return { p0: 'right', p1: 'left' };
}

function badmintonSwapTeamCourts(c: BdTeamCourts): BdTeamCourts {
  return { p0: c.p1, p1: c.p0 };
}

function badmintonServerIdxForScore(c: BdTeamCourts, teamScore: number): number {
  const need: BdServiceCourt = teamScore % 2 === 0 ? 'right' : 'left';
  if (c.p0 === need) return 0;
  if (c.p1 === need) return 1;
  return 0;
}

/** BWF doubles: same server on consecutive wins (partners swap); side-out picks player in service court. */
export function badmintonDoublesPlayerIndex(
  state: Pick<LiveScoringState, 'pointWinnerLog'>,
  firstForSet: LiveTeamSide,
  matchFirst: LiveTeamSide,
  matchFirstPlayerIdx: number,
  _ta: number,
  _tb: number
): number {
  let teamACourts = badmintonInitialTeamCourts(
    matchFirst === 'teamA',
    matchFirst === 'teamA' ? matchFirstPlayerIdx : 0,
  );
  let teamBCourts = badmintonInitialTeamCourts(
    matchFirst === 'teamB',
    matchFirst === 'teamB' ? matchFirstPlayerIdx : 0,
  );

  const courts = (team: LiveTeamSide) => (team === 'teamA' ? teamACourts : teamBCourts);
  const setCourts = (team: LiveTeamSide, c: BdTeamCourts) => {
    if (team === 'teamA') teamACourts = c;
    else teamBCourts = c;
  };

  const log = state.pointWinnerLog ?? [];
  let a = 0;
  let b = 0;
  let serverTeam = firstForSet;
  let serverIdx = badmintonServerIdxForScore(courts(serverTeam), serverTeam === 'teamA' ? a : b);

  for (const winner of log) {
    if (winner === 'teamA') a += 1;
    else b += 1;
    if (winner === serverTeam) {
      setCourts(serverTeam, badmintonSwapTeamCourts(courts(serverTeam)));
    } else {
      serverTeam = winner;
      const score = serverTeam === 'teamA' ? a : b;
      serverIdx = badmintonServerIdxForScore(courts(serverTeam), score);
    }
  }

  return serverIdx;
}
