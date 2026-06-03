import type { BasicUser } from '@/types';
import type { CourtServeSide, LiveTeamSide } from '@/utils/liveScoring';

export type ClassicCourtVariant = 'padel' | 'tennis';

export const CLASSIC_VB = { w: 100, h: 200 };
export const CLASSIC_NET_Y = 100;
export const CLASSIC_M = 2;
export const CLASSIC_NET_HALF_H = 5;

export const CLASSIC_Y_BASELINE_TOP = 14;
export const CLASSIC_Y_BASELINE_BOTTOM = 186;
export const CLASSIC_Y_PARTNER_NET_TOP = 72;
export const CLASSIC_Y_PARTNER_NET_BOTTOM = 128;
export const CLASSIC_BALL_Y_BOTTOM = 156;
export const CLASSIC_BALL_Y_TOP = 44;
export const CLASSIC_ARROW_END_Y_TOP = 56;
export const CLASSIC_ARROW_END_Y_BOTTOM = 144;
export const CLASSIC_ARROW_END_X_IN = 30;
export const CLASSIC_ARROW_END_X_OUT = 70;
export const CLASSIC_X_L = 26;
export const CLASSIC_X_R = 74;
export const CLASSIC_MID_X = CLASSIC_VB.w / 2;

export function classicServiceFromNet(variant: ClassicCourtVariant): number {
  return variant === 'tennis' ? 64 : 69.5;
}

/** Playable width for service boxes / avatars (full court for padel & doubles; inset singles alleys for tennis). */
export function classicPlayBounds(variant: ClassicCourtVariant, matchDoubles: boolean): { xL: number; xR: number } {
  if (variant !== 'tennis' || matchDoubles) return { xL: CLASSIC_X_L, xR: CLASSIC_X_R };
  const inset = 12;
  return { xL: CLASSIC_X_L + inset, xR: CLASSIC_X_R - inset };
}

export function classicSinglesSidelineX(variant: ClassicCourtVariant, matchDoubles: boolean): { left: number; right: number } | null {
  if (variant !== 'tennis' || matchDoubles) return null;
  const inset = 12;
  return { left: CLASSIC_M + inset, right: CLASSIC_VB.w - CLASSIC_M - inset };
}

export function classicVisualEnd(team: LiveTeamSide, endsSwapped: boolean): 'top' | 'bottom' {
  const aOnBottom = !endsSwapped;
  if (team === 'teamA') return aOnBottom ? 'bottom' : 'top';
  return aOnBottom ? 'top' : 'bottom';
}

export function classicServeTargetIsWest(
  serverTeam: LiveTeamSide,
  courtSide: CourtServeSide,
  endsSwapped: boolean
): boolean {
  const isRightDeuce = courtSide === 'rightDeuce';
  return classicVisualEnd(serverTeam, endsSwapped) === 'top' ? isRightDeuce : !isRightDeuce;
}

export function classicServeDiagonalArrowD(
  variant: ClassicCourtVariant,
  matchDoubles: boolean,
  serverEnd: 'top' | 'bottom',
  westServe: boolean
): string {
  const { xL, xR } = classicPlayBounds(variant, matchDoubles);
  const cx = CLASSIC_MID_X;
  if (serverEnd === 'bottom') {
    const cy = 78;
    return westServe
      ? `M ${xL} ${CLASSIC_BALL_Y_BOTTOM} Q ${cx} ${cy} ${CLASSIC_ARROW_END_X_OUT} ${CLASSIC_ARROW_END_Y_TOP}`
      : `M ${xR} ${CLASSIC_BALL_Y_BOTTOM} Q ${cx} ${cy} ${CLASSIC_ARROW_END_X_IN} ${CLASSIC_ARROW_END_Y_TOP}`;
  }
  const cy = 128;
  return westServe
    ? `M ${xL} ${CLASSIC_BALL_Y_TOP} Q ${cx} ${cy} ${CLASSIC_ARROW_END_X_OUT} ${CLASSIC_ARROW_END_Y_BOTTOM}`
    : `M ${xR} ${CLASSIC_BALL_Y_TOP} Q ${cx} ${cy} ${CLASSIC_ARROW_END_X_IN} ${CLASSIC_ARROW_END_Y_BOTTOM}`;
}

export function classicBallPct(
  variant: ClassicCourtVariant,
  matchDoubles: boolean,
  serverTeam: LiveTeamSide,
  courtSide: CourtServeSide,
  endsSwapped: boolean
): { left: number; top: number } {
  const west = classicServeTargetIsWest(serverTeam, courtSide, endsSwapped);
  const { xL, xR } = classicPlayBounds(variant, matchDoubles);
  const x = west ? xL : xR;
  const end = classicVisualEnd(serverTeam, endsSwapped);
  const y = end === 'bottom' ? CLASSIC_BALL_Y_BOTTOM : CLASSIC_BALL_Y_TOP;
  return { left: (x / CLASSIC_VB.w) * 100, top: (y / CLASSIC_VB.h) * 100 };
}

function avatarY(end: 'top' | 'bottom', depth: 'baseline' | 'net'): number {
  if (end === 'top') return depth === 'net' ? CLASSIC_Y_PARTNER_NET_TOP : CLASSIC_Y_BASELINE_TOP;
  return depth === 'net' ? CLASSIC_Y_PARTNER_NET_BOTTOM : CLASSIC_Y_BASELINE_BOTTOM;
}

export function classicBaselineAvatarLayout(
  variant: ClassicCourtVariant,
  players: BasicUser[],
  end: 'top' | 'bottom',
  team: LiveTeamSide,
  serverTeam: LiveTeamSide,
  courtSide: CourtServeSide,
  serverPlayerIndex: number,
  endsSwapped: boolean,
  teamASidesMirrored: boolean,
  teamBSidesMirrored: boolean,
  baselineOnly = false,
  matchDoubles = false
): { left: number; top: number; player: BasicUser | null; idx: number }[] {
  const px = (x: number) => (x / CLASSIC_VB.w) * 100;
  const py = (y: number) => (y / CLASSIC_VB.h) * 100;
  const baselineY = py(avatarY(end, 'baseline'));
  const netY = py(avatarY(end, 'net'));
  const { xL, xR } = classicPlayBounds(variant, matchDoubles);
  const xLeft = px(xL);
  const xRight = px(xR);
  const teamMirrored = team === 'teamA' ? teamASidesMirrored : teamBSidesMirrored;
  const west = classicServeTargetIsWest(serverTeam, courtSide, endsSwapped);
  const serverX = west ? xLeft : xRight;
  const partnerX = west ? xRight : xLeft;
  const serving = !baselineOnly && serverTeam === team;
  const pair = matchDoubles ? players.slice(0, 2) : players.slice(0, 1);
  const n = pair.length;
  if (n === 0) return [];
  if (n === 1 && !matchDoubles) {
    const sideX = teamMirrored ? xLeft : xRight;
    return [{ left: serving ? serverX : sideX, top: baselineY, player: pair[0] ?? null, idx: 0 }];
  }
  if (n === 1 && matchDoubles) {
    const p0Left = teamMirrored ? xLeft : xRight;
    const p1Left = teamMirrored ? xRight : xLeft;
    return [
      { left: p0Left, top: baselineY, player: pair[0] ?? null, idx: 0 },
      { left: p1Left, top: baselineY, player: null, idx: 1 },
    ];
  }
  const si = Math.min(Math.max(0, serverPlayerIndex), n - 1);
  const p0Left = teamMirrored ? xLeft : xRight;
  const p1Left = teamMirrored ? xRight : xLeft;
  if (!serving) {
    return [
      { left: p0Left, top: baselineY, player: pair[0] ?? null, idx: 0 },
      { left: p1Left, top: baselineY, player: pair[1] ?? null, idx: 1 },
    ];
  }
  return [0, 1].map((idx) => ({
    idx,
    player: pair[idx] ?? null,
    left: idx === si ? serverX : partnerX,
    top: idx === si ? baselineY : netY,
  }));
}
