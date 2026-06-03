/** Keep in sync with Backend/src/shared/officiatingEnforcement.ts */
import type { OfficiatingLevel } from './officiatingLevel';
import { officiatingIsStrict } from './officiatingLevel';

export type LiveTeamSide = 'teamA' | 'teamB';

export type CourtServeSide = 'rightDeuce' | 'leftAd';

export type LiveScoringOfficiatingFields = {
  officiatingLetPending?: boolean;
};

export type StrictScoreBlockCode = 'LET_PENDING' | 'SERVE_SIDE_MISMATCH';

export function opponentTeam(side: LiveTeamSide): LiveTeamSide {
  return side === 'teamA' ? 'teamB' : 'teamA';
}

export function withLetPending<T extends LiveScoringOfficiatingFields>(state: T): T {
  return { ...state, officiatingLetPending: true };
}

export function clearLetPending<T extends LiveScoringOfficiatingFields>(state: T): T {
  const next = { ...state };
  delete next.officiatingLetPending;
  return next;
}

export function isLetReplayBlockingScore(
  state: LiveScoringOfficiatingFields,
  level: OfficiatingLevel,
): boolean {
  return officiatingIsStrict(level) && state.officiatingLetPending === true;
}

/** BWF: even server score → right service court, odd → left. */
export function expectedBadmintonCourtSide(serverScore: number): CourtServeSide {
  return serverScore % 2 === 0 ? 'rightDeuce' : 'leftAd';
}

export function validateStrictBadmintonServeCourt(
  serverScore: number,
  courtSide: CourtServeSide,
): boolean {
  return courtSide === expectedBadmintonCourtSide(serverScore);
}

export function validateStrictBadmintonServeBeforePoint(input: {
  level: OfficiatingLevel;
  sport?: string | null;
  serverScore: number;
  courtSide: CourtServeSide | null | undefined;
}): { ok: true } | { ok: false; code: 'SERVE_SIDE_MISMATCH' } {
  if (!officiatingIsStrict(input.level)) return { ok: true };
  const sport = typeof input.sport === 'string' ? input.sport.toUpperCase() : input.sport;
  if (sport !== 'BADMINTON') return { ok: true };
  if (!input.courtSide) return { ok: true };
  if (!validateStrictBadmintonServeCourt(input.serverScore, input.courtSide)) {
    return { ok: false, code: 'SERVE_SIDE_MISMATCH' };
  }
  return { ok: true };
}
