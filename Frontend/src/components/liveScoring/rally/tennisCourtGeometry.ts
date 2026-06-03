/** ITF tennis court dimensions (metres). */
export const TN_COURT_L = 23.77;
export const TN_COURT_W_D = 10.97;
export const TN_COURT_W_S = 8.23;
export const TN_ALLEY = (TN_COURT_W_D - TN_COURT_W_S) / 2; // 1.37 m
export const TN_SERVICE_FROM_NET = 6.4;
export const TN_HALF_L = TN_COURT_L / 2; // 11.885 m
export const TN_SERVICE_HALF_W_D = TN_COURT_W_D / 2;
export const TN_SERVICE_HALF_W_S = TN_COURT_W_S / 2;

/** 18 viewBox units per metre — keeps scene height near badminton. */
export const TN_SCALE = 18;
const u = (m: number) => m * TN_SCALE;

export const TN_COURT_W = u(TN_COURT_W_D);
export const TN_COURT_H = u(TN_COURT_L);

export const TN_SURFACE = { x: 0, y: 0, w: TN_COURT_W, h: TN_COURT_H };

const { y: sy, h: sh } = TN_SURFACE;

export const TN_NET_Y = sy + sh / 2;
export const TN_CENTER_X = TN_COURT_W / 2;
export const TN_SINGLES_LEFT = u(TN_ALLEY);
export const TN_SINGLES_RIGHT = TN_COURT_W - u(TN_ALLEY);
export const TN_SERVICE_TOP = TN_NET_Y - u(TN_SERVICE_FROM_NET);
export const TN_SERVICE_BOTTOM = TN_NET_Y + u(TN_SERVICE_FROM_NET);

export const TN_LEFT_BOX_CX = TN_SINGLES_LEFT + u(TN_SERVICE_HALF_W_S / 2);
export const TN_RIGHT_BOX_CX = TN_CENTER_X + u(TN_SERVICE_HALF_W_S / 2);

/** Baseline band — server stands just inside the baseline for serve guide. */
export const TN_BASELINE_TOP_Y = sy + u(0.85);
export const TN_BASELINE_BOTTOM_Y = sy + sh - u(0.85);

export const TN_PLAYER_TOP_Y = sy - 16;
export const TN_PLAYER_BOTTOM_Y = sy + sh + 16;

export const TN_SERVE_ARC_MIN_RISE = 48;
export const TN_SERVE_ARC_RISE_FACTOR = 0.58;

export function tnServerEnd(serverTeam: 'teamA' | 'teamB', courtEndsSwapped: boolean): 'top' | 'bottom' {
  const serverOnTop = courtEndsSwapped ? serverTeam === 'teamA' : serverTeam === 'teamB';
  return serverOnTop ? 'top' : 'bottom';
}

/** Deuce (right) vs ad (left) target half on the receiver's end. */
export function tnServeTargetSide(serverEnd: 'top' | 'bottom', serveRight: boolean): 'left' | 'right' {
  const west = serverEnd === 'top' ? serveRight : !serveRight;
  return west ? 'left' : 'right';
}

export function tnServiceBoxRect(
  end: 'top' | 'bottom',
  side: 'left' | 'right',
  matchDoubles: boolean
): { x: number; y: number; w: number; h: number } {
  const x = side === 'left' ? (matchDoubles ? 0 : TN_SINGLES_LEFT) : matchDoubles ? TN_CENTER_X : TN_CENTER_X;
  const w = matchDoubles
    ? TN_SERVICE_HALF_W_D
    : side === 'left'
      ? TN_CENTER_X - TN_SINGLES_LEFT
      : TN_SINGLES_RIGHT - TN_CENTER_X;
  if (end === 'top') {
    return { x, y: TN_SERVICE_TOP, w, h: TN_NET_Y - TN_SERVICE_TOP };
  }
  return { x, y: TN_NET_Y, w, h: TN_SERVICE_BOTTOM - TN_NET_Y };
}

export function tnSinglesBoxXForEnd(end: 'top' | 'bottom', serveRight: boolean): number {
  if (serveRight) return end === 'top' ? TN_LEFT_BOX_CX : TN_RIGHT_BOX_CX;
  return end === 'top' ? TN_RIGHT_BOX_CX : TN_LEFT_BOX_CX;
}

export function tnDoublesSlotXAtEnd(
  end: 'top' | 'bottom',
  idx: number,
  serverPlayerIndex: number,
  serveRight: boolean,
  isServerEnd: boolean
): number {
  const serveX = tnSinglesBoxXForEnd(end, serveRight);
  const otherX = tnSinglesBoxXForEnd(end, !serveRight);
  if (isServerEnd) {
    return idx === serverPlayerIndex ? serveX : otherX;
  }
  return idx === 0 ? serveX : otherX;
}

export function tnPlayerXForSlot(
  end: 'top' | 'bottom',
  idx: number,
  matchDoubles: boolean,
  serveRight: boolean,
  layoutServe: boolean,
  serverPlayerIndex: number,
  serverEnd: 'top' | 'bottom'
): number {
  if (matchDoubles) {
    if (layoutServe) {
      return tnDoublesSlotXAtEnd(end, idx, serverPlayerIndex, serveRight, end === serverEnd);
    }
    return idx === 0 ? TN_LEFT_BOX_CX : TN_RIGHT_BOX_CX;
  }
  if (layoutServe) {
    return tnSinglesBoxXForEnd(end, serveRight);
  }
  return TN_CENTER_X;
}

export function tnPlayerYForEnd(end: 'top' | 'bottom', layoutServe: boolean): number {
  if (!layoutServe) return end === 'top' ? TN_PLAYER_TOP_Y : TN_PLAYER_BOTTOM_Y;
  return end === 'top' ? TN_BASELINE_TOP_Y : TN_BASELINE_BOTTOM_Y;
}

export function tnBallYInFrontOfPlayer(end: 'top' | 'bottom', playerY: number): number {
  const towardNet = end === 'top' ? TN_SERVICE_TOP : TN_SERVICE_BOTTOM;
  return playerY + (towardNet - playerY) * 0.55;
}

export function tnReceiveTargetYForEnd(end: 'top' | 'bottom'): number {
  if (end === 'top') return TN_SERVICE_TOP + (TN_NET_Y - TN_SERVICE_TOP) * 0.45;
  return TN_NET_Y + (TN_SERVICE_BOTTOM - TN_NET_Y) * 0.55;
}

export function tnServeArcReceiverPlayerIndex(_opts: { matchDoubles: boolean }): number {
  return 0;
}

export type TnServeFlatTrace = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  control: { x: number; y: number };
};

export function tnServeFlatTrace(opts: {
  serverTeam: 'teamA' | 'teamB';
  courtEndsSwapped: boolean;
  serveRight: boolean;
  matchDoubles: boolean;
  serverPlayerIndex: number;
}): TnServeFlatTrace {
  const serverEnd = tnServerEnd(opts.serverTeam, opts.courtEndsSwapped);
  const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';

  const startX = opts.matchDoubles
    ? tnDoublesSlotXAtEnd(serverEnd, opts.serverPlayerIndex, opts.serverPlayerIndex, opts.serveRight, true)
    : tnSinglesBoxXForEnd(serverEnd, opts.serveRight);
  const startY = tnBallYInFrontOfPlayer(serverEnd, tnPlayerYForEnd(serverEnd, true));

  const endX = opts.matchDoubles
    ? tnDoublesSlotXAtEnd(receiverEnd, 0, opts.serverPlayerIndex, opts.serveRight, false)
    : tnSinglesBoxXForEnd(receiverEnd, opts.serveRight);
  const endY = tnReceiveTargetYForEnd(receiverEnd);

  return {
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    control: { x: (startX + endX) / 2, y: TN_NET_Y },
  };
}
