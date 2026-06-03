import type { BasicUser } from '@/types';
import type { CourtServeSide, LiveTeamSide } from '@/utils/liveScoring';

/** FIP padel — 10 m × 10 m per side, 10 viewBox units per metre. */
export const PADEL_UNITS_PER_M = 10;
export const PADEL_COURT_W_M = 10;
export const PADEL_COURT_L_M = 20;
export const PADEL_SERVICE_DEPTH_M = 6.95;
export const PADEL_BACK_COURT_M = PADEL_COURT_L_M / 2 - PADEL_SERVICE_DEPTH_M;

export const PADEL_VB_W = PADEL_COURT_W_M * PADEL_UNITS_PER_M;
export const PADEL_VB_H = PADEL_COURT_L_M * PADEL_UNITS_PER_M;
export const PADEL_NET_Y = PADEL_VB_H / 2;
export const PADEL_SERVICE_FROM_NET = PADEL_SERVICE_DEPTH_M * PADEL_UNITS_PER_M;

/** Full playing surface (surround is drawn outside in layout). */
export const PADEL_SURFACE = { x: 0, y: 0, w: PADEL_VB_W, h: PADEL_VB_H };

const { x: sx, y: sy, w: sw, h: sh } = PADEL_SURFACE;
export const PD_CENTER_X = sx + sw / 2;
export const PD_SERVICE_TOP_Y = PADEL_NET_Y - PADEL_SERVICE_FROM_NET;
export const PD_SERVICE_BOTTOM_Y = PADEL_NET_Y + PADEL_SERVICE_FROM_NET;

const backCourtDepth = PADEL_BACK_COURT_M * PADEL_UNITS_PER_M;
const serviceBoxDepth = PADEL_SERVICE_FROM_NET;

export const PD_X_L = sw * 0.26;
export const PD_X_R = sw * 0.74;

export const PD_Y_BASELINE_TOP = sy + backCourtDepth * 0.14;
export const PD_Y_BASELINE_BOTTOM = sy + sh - backCourtDepth * 0.14;
export const PD_Y_PARTNER_NET_TOP = PD_SERVICE_TOP_Y + serviceBoxDepth * 0.58;
export const PD_Y_PARTNER_NET_BOTTOM = PD_SERVICE_BOTTOM_Y - serviceBoxDepth * 0.58;

/** Serve contact — between baseline row and service line, toward the net (mirrors pickleball). */
const PD_SERVE_BALL_FRAC = 0.45;

export function pdServeBallYForEnd(end: 'top' | 'bottom'): number {
  const baseline = pdBaselineYForEnd(end);
  if (end === 'top') {
    return baseline + (PD_SERVICE_TOP_Y - baseline) * PD_SERVE_BALL_FRAC;
  }
  return baseline - (baseline - PD_SERVICE_BOTTOM_Y) * PD_SERVE_BALL_FRAC;
}

/** Diagonal landing zone — mirrors pbReceiveTargetYForEnd (NVZ ↔ service line). */
export function pdReceiveTargetYForEnd(end: 'top' | 'bottom'): number {
  const { y: sy, h: sh } = PADEL_SURFACE;
  if (end === 'top') {
    return sy + (PD_SERVICE_TOP_Y - sy) * 0.42;
  }
  return PD_SERVICE_BOTTOM_Y + (sy + sh - PD_SERVICE_BOTTOM_Y) * 0.58;
}

/** Singles service box X — diagonal from server side (mirrors pbSinglesBoxXForEnd). */
export function pdSinglesBoxXForEnd(end: 'top' | 'bottom', westServe: boolean): number {
  if (westServe) return end === 'top' ? PD_X_L : PD_X_R;
  return end === 'top' ? PD_X_R : PD_X_L;
}

export const PD_PLAYER_TOP_Y = sy - 12;
export const PD_PLAYER_BOTTOM_Y = sy + sh + 12;

export const PD_COURT_BLUE = { top: '#2563a8', bottom: '#1d4f8c' };
/** Out-of-court grass (matches outdoor pickleball surround). */
export const PD_SURROUND = { top: '#3d7a45', bottom: '#2f6636' };

export function pdServerEnd(serverTeam: LiveTeamSide, courtEndsSwapped: boolean): 'top' | 'bottom' {
  const serverOnTop = courtEndsSwapped ? serverTeam === 'teamA' : serverTeam === 'teamB';
  return serverOnTop ? 'top' : 'bottom';
}

export function pdBaselineYForEnd(end: 'top' | 'bottom'): number {
  return end === 'top' ? PD_Y_BASELINE_TOP : PD_Y_BASELINE_BOTTOM;
}

const PD_FAR_END_SERVER_ROW_FRAC = 0.42;
const PD_FAR_END_RECEIVER_ROW_FRAC = 0.58;

function pdFarEndRowYForEnd(end: 'top' | 'bottom', frac: number): number {
  if (end === 'bottom') return pdBaselineYForEnd(end);
  const baseline = PD_Y_BASELINE_TOP;
  return baseline + (PD_SERVICE_TOP_Y - baseline) * frac;
}

export function pdServerStandYForEnd(end: 'top' | 'bottom'): number {
  return pdFarEndRowYForEnd(end, PD_FAR_END_SERVER_ROW_FRAC);
}

export function pdReceiverStandYForEnd(end: 'top' | 'bottom'): number {
  return pdFarEndRowYForEnd(end, PD_FAR_END_RECEIVER_ROW_FRAC);
}

export function pdPartnerYForEnd(end: 'top' | 'bottom'): number {
  return end === 'top' ? PD_Y_PARTNER_NET_TOP : PD_Y_PARTNER_NET_BOTTOM;
}

export function pdPlayerYForEnd(
  end: 'top' | 'bottom',
  layoutServe: boolean,
  opts?: { endsSetup?: boolean }
): number {
  if (!layoutServe) return end === 'top' ? PD_PLAYER_TOP_Y : PD_PLAYER_BOTTOM_Y;
  if (end === 'top' && opts?.endsSetup) return pdReceiverStandYForEnd(end);
  return pdBaselineYForEnd(end);
}

/** Baseline left/right for doubles when not in active serve placement (mirrors pickleball). */
export function pdDoublesMirroredX(idx: number, teamMirrored: boolean): number {
  const p0 = teamMirrored ? PD_X_L : PD_X_R;
  const p1 = teamMirrored ? PD_X_R : PD_X_L;
  return idx === 0 ? p0 : p1;
}

export function pdDoublesServeX(
  idx: number,
  serverPlayerIndex: number,
  serveRight: boolean,
  isServerEnd: boolean
): number {
  const serveX = serveRight ? PD_X_R : PD_X_L;
  const otherX = serveRight ? PD_X_L : PD_X_R;
  if (isServerEnd) return idx === serverPlayerIndex ? serveX : otherX;
  return idx === 0 ? serveX : otherX;
}

export function pdPlayerXForSlot(
  end: 'top' | 'bottom',
  idx: number,
  matchDoubles: boolean,
  westServe: boolean,
  layoutServe: boolean,
  serverPlayerIndex: number,
  serverEnd: 'top' | 'bottom',
  opts?: {
    team?: LiveTeamSide;
    serverTeam?: LiveTeamSide;
    teamMirrored?: boolean;
    endsSetup?: boolean;
  }
): number {
  if (!layoutServe) return PD_CENTER_X;
  if (!matchDoubles) {
    if (opts?.endsSetup) return PD_CENTER_X;
    return pdSinglesBoxXForEnd(end, westServe);
  }
  if (matchDoubles) {
    const team = opts?.team;
    const serverTeam = opts?.serverTeam;
    const teamMirrored = opts?.teamMirrored ?? false;
    const endsSetup = opts?.endsSetup ?? false;
    const isServerEnd = end === serverEnd;
    const servingThisEnd = !endsSetup && serverTeam != null && team === serverTeam && isServerEnd;
    if (endsSetup || !servingThisEnd) return pdDoublesMirroredX(idx, teamMirrored);
    return pdDoublesServeX(idx, serverPlayerIndex, westServe, isServerEnd);
  }
  return PD_CENTER_X;
}

export type PdFlatSlot = {
  x: number;
  y: number;
  player: BasicUser | null;
  team: LiveTeamSide;
  idx: number;
};

export function pdFlatPlayerSlots(opts: {
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  courtEndsSwapped: boolean;
  courtTeamASidesMirrored: boolean;
  courtTeamBSidesMirrored: boolean;
  serverTeam: LiveTeamSide;
  serverPlayerIndex: number;
  courtSide: CourtServeSide;
  matchDoubles: boolean;
  endsSetup: boolean;
  layoutServe: boolean;
}): PdFlatSlot[] {
  const topTeam: LiveTeamSide = opts.courtEndsSwapped ? 'teamA' : 'teamB';
  const bottomTeam: LiveTeamSide = opts.courtEndsSwapped ? 'teamB' : 'teamA';
  const serveRight = opts.courtSide === 'rightDeuce';
  const serverEnd = pdServerEnd(opts.serverTeam, opts.courtEndsSwapped);
  const receiverEnd: 'top' | 'bottom' = serverEnd === 'top' ? 'bottom' : 'top';

  const playersFor = (team: LiveTeamSide) => (team === 'teamA' ? opts.teamAPlayers : opts.teamBPlayers);

  const endSlots = (end: 'top' | 'bottom', team: LiveTeamSide): PdFlatSlot[] => {
    const roster = playersFor(team);
    const pair = opts.matchDoubles ? roster.slice(0, 2) : roster.slice(0, 1);
    const teamMirrored = team === 'teamA' ? opts.courtTeamASidesMirrored : opts.courtTeamBSidesMirrored;
    const serving = !opts.endsSetup && opts.serverTeam === team;
    const yRow = pdPlayerYForEnd(end, opts.layoutServe, { endsSetup: opts.endsSetup });
    const yNet = pdPartnerYForEnd(end);

    if (pair.length === 0) return [];
    if (pair.length === 1 && !opts.matchDoubles) {
      const isServer = !opts.endsSetup && opts.serverTeam === team && end === serverEnd;
      const isReceiver = !opts.endsSetup && opts.serverTeam !== team && end === receiverEnd;
      const x = pdPlayerXForSlot(end, 0, false, serveRight, opts.layoutServe, 0, serverEnd, {
        team,
        serverTeam: opts.serverTeam,
        endsSetup: opts.endsSetup,
      });
      let y = yRow;
      if (opts.layoutServe && end === 'top') {
        if (isServer) y = pdServerStandYForEnd(end);
        else if (isReceiver) y = pdReceiverStandYForEnd(end);
      }
      return [{ x, y, player: pair[0] ?? null, team, idx: 0 }];
    }

    if (pair.length === 1 && opts.matchDoubles) {
      const x0 = pdDoublesMirroredX(0, teamMirrored);
      const x1 = pdDoublesMirroredX(1, teamMirrored);
      return [
        { x: x0, y: yRow, player: pair[0] ?? null, team, idx: 0 },
        { x: x1, y: yRow, player: null, team, idx: 1 },
      ];
    }

    const si = Math.min(Math.max(0, opts.serverPlayerIndex), pair.length - 1);
    const serveX = serveRight ? PD_X_R : PD_X_L;
    const partnerX = serveRight ? PD_X_L : PD_X_R;

    if (!serving || opts.endsSetup) {
      const recvIdx =
        !opts.endsSetup && end === receiverEnd
          ? pdServeArcReceiverPlayerIndex({
              receiverTeam: team,
              westServe: serveRight,
              matchDoubles: true,
              courtTeamASidesMirrored: opts.courtTeamASidesMirrored,
              courtTeamBSidesMirrored: opts.courtTeamBSidesMirrored,
            })
          : -1;
      return [0, 1].map((idx) => ({
        x: pdDoublesMirroredX(idx, teamMirrored),
        y:
          opts.layoutServe && !opts.endsSetup && end === 'top' && idx === recvIdx
            ? pdReceiverStandYForEnd(end)
            : yRow,
        player: pair[idx] ?? null,
        team,
        idx,
      }));
    }

    const serverY =
      opts.layoutServe && end === 'top' ? pdServerStandYForEnd(end) : yRow;
    return [0, 1].map((idx) => ({
      x: idx === si ? serveX : partnerX,
      y: idx === si ? serverY : yNet,
      player: pair[idx] ?? null,
      team,
      idx,
    }));
  };

  return [...endSlots('top', topTeam), ...endSlots('bottom', bottomTeam)];
}

/** Receiver in the diagonal service box on the opposite end. */
export function pdServeArcReceiverPlayerIndex(opts: {
  receiverTeam: LiveTeamSide;
  westServe: boolean;
  matchDoubles: boolean;
  courtTeamASidesMirrored: boolean;
  courtTeamBSidesMirrored: boolean;
}): number {
  if (!opts.matchDoubles) return 0;
  const mirrored =
    opts.receiverTeam === 'teamA' ? opts.courtTeamASidesMirrored : opts.courtTeamBSidesMirrored;
  const serveRight = opts.westServe;
  const receiverOnLeft = serveRight;
  if (receiverOnLeft) return mirrored ? 0 : 1;
  return mirrored ? 1 : 0;
}

export function pdServeFlatPoints(opts: {
  serverTeam: LiveTeamSide;
  courtSide: CourtServeSide;
  courtEndsSwapped: boolean;
  matchDoubles: boolean;
  serverPlayerIndex?: number;
}): { start: { x: number; y: number }; end: { x: number; y: number }; control: { x: number; y: number } } {
  const serverEnd = pdServerEnd(opts.serverTeam, opts.courtEndsSwapped);
  const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';
  const serveRight = opts.courtSide === 'rightDeuce';
  const si = Math.min(Math.max(0, opts.serverPlayerIndex ?? 0), 1);

  const startX = opts.matchDoubles
    ? pdDoublesServeX(si, si, serveRight, true)
    : pdSinglesBoxXForEnd(serverEnd, serveRight);
  const startY = pdServeBallYForEnd(serverEnd);

  const endX = opts.matchDoubles
    ? serveRight
      ? PD_X_L
      : PD_X_R
    : pdSinglesBoxXForEnd(receiverEnd, serveRight);
  const endY = pdReceiveTargetYForEnd(receiverEnd);

  return {
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    control: { x: (startX + endX) / 2, y: PADEL_NET_Y },
  };
}

/** Service box between service line and net (FIP 6.95 m deep). */
export function pdServiceBoxRect(end: 'top' | 'bottom', side: 'left' | 'right'): { x: number; y: number; w: number; h: number } {
  const halfW = sw / 2;
  const x = side === 'left' ? sx : PD_CENTER_X;
  if (end === 'top') {
    return { x, y: PD_SERVICE_TOP_Y, w: halfW, h: PADEL_NET_Y - PD_SERVICE_TOP_Y };
  }
  return { x, y: PADEL_NET_Y, w: halfW, h: PD_SERVICE_BOTTOM_Y - PADEL_NET_Y };
}

export function pdActiveServiceBoxSide(
  serverEnd: 'top' | 'bottom',
  serveRight: boolean
): { end: 'top' | 'bottom'; side: 'left' | 'right' } {
  const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';
  const x = pdSinglesBoxXForEnd(receiverEnd, serveRight);
  return { end: receiverEnd, side: x < PD_CENTER_X ? 'left' : 'right' };
}
