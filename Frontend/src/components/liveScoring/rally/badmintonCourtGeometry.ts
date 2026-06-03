/** BWF court dimensions (metres) — Laws of Badminton / diagram refs. */
export const BD_COURT_L = 13.4;
export const BD_COURT_W_D = 6.1;
export const BD_COURT_W_S = 5.18;
export const BD_ALLEY = (BD_COURT_W_D - BD_COURT_W_S) / 2; // 0.46 m
export const BD_SHORT_SERVICE = 1.98;
export const BD_DOUBLES_LONG = 0.76;
export const BD_SERVICE_HALF_W = BD_COURT_W_S / 2; // 2.59 m
export const BD_HALF_L = BD_COURT_L / 2; // 6.70 m
export const BD_BACK_SERVICE = BD_HALF_L - BD_SHORT_SERVICE - BD_DOUBLES_LONG; // 3.96 m

/** 20 viewBox units = 1 m — exact BWF proportions. */
export const BD_SCALE = 20;
const u = (m: number) => m * BD_SCALE;

export const BD_COURT_W = u(BD_COURT_W_D);
export const BD_COURT_H = u(BD_COURT_L);
/** Keep line strokes inside the SVG viewBox (avoids clipped corners). */
export const BD_VIEW_PAD = 3;
export const BD_VB_W = BD_COURT_W + BD_VIEW_PAD * 2;
export const BD_VB_H = BD_COURT_H + BD_VIEW_PAD * 2;
export const BD_VIEW_BOX = `0 0 ${BD_VB_W} ${BD_VB_H}`;

export const BD_SURFACE = {
  x: 0,
  y: 0,
  w: BD_COURT_W,
  h: BD_COURT_H,
  rx: 0,
};

const { y: sy, h: sh } = BD_SURFACE;

export const BD_NET_Y = sy + sh / 2;
export const BD_CENTER_X = BD_COURT_W / 2;
export const BD_SINGLES_LEFT = u(BD_ALLEY);
export const BD_SINGLES_RIGHT = BD_COURT_W - u(BD_ALLEY);
export const BD_SHORT_SERVICE_TOP = BD_NET_Y - u(BD_SHORT_SERVICE);
export const BD_SHORT_SERVICE_BOTTOM = BD_NET_Y + u(BD_SHORT_SERVICE);
export const BD_DOUBLES_LONG_TOP = sy + u(BD_DOUBLES_LONG);
export const BD_DOUBLES_LONG_BOTTOM = sy + sh - u(BD_DOUBLES_LONG);

export const BD_LEFT_BOX_CX = BD_SINGLES_LEFT + u(BD_SERVICE_HALF_W / 2);
export const BD_RIGHT_BOX_CX = BD_CENTER_X + u(BD_SERVICE_HALF_W / 2);

export const BD_BACKCOURT_TOP_Y =
  BD_DOUBLES_LONG_TOP + (BD_SHORT_SERVICE_TOP - BD_DOUBLES_LONG_TOP) / 2;
export const BD_BACKCOURT_BOTTOM_Y =
  BD_SHORT_SERVICE_BOTTOM + (BD_DOUBLES_LONG_BOTTOM - BD_SHORT_SERVICE_BOTTOM) / 2;

/** Ends-setup avatars — just outside the baselines (mirrors pickleball). */
export const BD_PLAYER_TOP_Y = sy - 14;
export const BD_PLAYER_BOTTOM_Y = sy + sh + 14;

/** BWF: centre line only in back service courts — not through front zone (net ↔ short service). */
export const BD_CENTRE_LINE_TOP_END = BD_SHORT_SERVICE_TOP;
export const BD_CENTRE_LINE_BOTTOM_START = BD_SHORT_SERVICE_BOTTOM;

/** BWF ratios for compact layouts (watch). */
export const BD_RATIO = {
  shortServiceFromNet: BD_SHORT_SERVICE / BD_HALF_L,
  backServiceDepth: BD_BACK_SERVICE / BD_HALF_L,
  doublesLongFromBaseline: BD_DOUBLES_LONG / BD_HALF_L,
  singlesAlley: BD_ALLEY / BD_COURT_W_D,
  frontServiceDepth: BD_SHORT_SERVICE / BD_HALF_L,
} as const;

export function bdServerEnd(
  serverTeam: 'teamA' | 'teamB',
  courtEndsSwapped: boolean
): 'top' | 'bottom' {
  const serverOnTop = courtEndsSwapped ? serverTeam === 'teamA' : serverTeam === 'teamB';
  return serverOnTop ? 'top' : 'bottom';
}

export function bdServiceBoxRect(
  end: 'top' | 'bottom',
  side: 'left' | 'right'
): { x: number; y: number; w: number; h: number } {
  const x = side === 'left' ? BD_SINGLES_LEFT : BD_CENTER_X;
  const w = u(BD_SERVICE_HALF_W);
  if (end === 'top') {
    return { x, y: BD_SHORT_SERVICE_TOP, w, h: BD_NET_Y - BD_SHORT_SERVICE_TOP };
  }
  return { x, y: BD_NET_Y, w, h: BD_SHORT_SERVICE_BOTTOM - BD_NET_Y };
}

/** Back service court — where the server stands (short service line → doubles long line). */
export function bdBackServiceBoxRect(
  end: 'top' | 'bottom',
  side: 'left' | 'right'
): { x: number; y: number; w: number; h: number } {
  const x = side === 'left' ? BD_SINGLES_LEFT : BD_CENTER_X;
  const w = u(BD_SERVICE_HALF_W);
  if (end === 'top') {
    return { x, y: BD_DOUBLES_LONG_TOP, w, h: BD_SHORT_SERVICE_TOP - BD_DOUBLES_LONG_TOP };
  }
  return { x, y: BD_SHORT_SERVICE_BOTTOM, w, h: BD_DOUBLES_LONG_BOTTOM - BD_SHORT_SERVICE_BOTTOM };
}

/** Lob apex rise above the serve chord (perspective scene units). */
export const BD_SERVE_ARC_MIN_RISE = 52;
export const BD_SERVE_ARC_RISE_FACTOR = 0.62;

/** Shuttle contact — in front of the server, toward the short service line. */
export function bdShuttleYInFrontOfPlayer(end: 'top' | 'bottom', playerY: number): number {
  const towardNet = end === 'top' ? BD_SHORT_SERVICE_TOP : BD_SHORT_SERVICE_BOTTOM;
  return playerY + (towardNet - playerY) * 0.6;
}

/** Diagonal landing zone — front service court (mirrors pickleball). */
export function bdReceiveTargetYForEnd(end: 'top' | 'bottom'): number {
  const { y: sy, h: sh } = BD_SURFACE;
  if (end === 'top') return sy + (BD_SHORT_SERVICE_TOP - sy) * 0.42;
  return BD_SHORT_SERVICE_BOTTOM + (sy + sh - BD_SHORT_SERVICE_BOTTOM) * 0.58;
}

export function bdSinglesBoxXForEnd(end: 'top' | 'bottom', serveRight: boolean): number {
  if (serveRight) return end === 'top' ? BD_LEFT_BOX_CX : BD_RIGHT_BOX_CX;
  return end === 'top' ? BD_RIGHT_BOX_CX : BD_LEFT_BOX_CX;
}

export function bdSinglesQuadrantSide(end: 'top' | 'bottom', serveRight: boolean): 'left' | 'right' {
  return bdSinglesBoxXForEnd(end, serveRight) < BD_CENTER_X ? 'left' : 'right';
}

export function bdDoublesSlotXAtEnd(
  end: 'top' | 'bottom',
  idx: number,
  serverPlayerIndex: number,
  serveRight: boolean,
  isServerEnd: boolean
): number {
  const serveX = bdSinglesBoxXForEnd(end, serveRight);
  const otherX = bdSinglesBoxXForEnd(end, !serveRight);
  if (isServerEnd) {
    return idx === serverPlayerIndex ? serveX : otherX;
  }
  return idx === 0 ? serveX : otherX;
}

export function bdPlayerXForSlot(
  end: 'top' | 'bottom',
  idx: number,
  matchDoubles: boolean,
  serveRight: boolean,
  layoutServeBoxes: boolean,
  serverPlayerIndex: number,
  serverEnd: 'top' | 'bottom'
): number {
  if (matchDoubles) {
    if (layoutServeBoxes) {
      return bdDoublesSlotXAtEnd(end, idx, serverPlayerIndex, serveRight, end === serverEnd);
    }
    return idx === 0 ? BD_LEFT_BOX_CX : BD_RIGHT_BOX_CX;
  }
  if (layoutServeBoxes) {
    return bdSinglesBoxXForEnd(end, serveRight);
  }
  return BD_CENTER_X;
}

export function bdPlayerYForEnd(end: 'top' | 'bottom', layoutServeBoxes = true): number {
  if (!layoutServeBoxes) return end === 'top' ? BD_PLAYER_TOP_Y : BD_PLAYER_BOTTOM_Y;
  return end === 'top' ? BD_BACKCOURT_TOP_Y : BD_BACKCOURT_BOTTOM_Y;
}

export type BdServeFlatTrace = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  control: { x: number; y: number };
};

/** Receiver slot on the opposite end (matches bdServeFlatTrace). */
export function bdServeArcReceiverPlayerIndex(_opts: { matchDoubles: boolean }): number {
  return 0;
}

export function bdServeFlatTrace(opts: {
  serverTeam: 'teamA' | 'teamB';
  courtEndsSwapped: boolean;
  serveRight: boolean;
  matchDoubles: boolean;
  serverPlayerIndex: number;
}): BdServeFlatTrace {
  const serverEnd = bdServerEnd(opts.serverTeam, opts.courtEndsSwapped);
  const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';

  const startX = opts.matchDoubles
    ? bdDoublesSlotXAtEnd(serverEnd, opts.serverPlayerIndex, opts.serverPlayerIndex, opts.serveRight, true)
    : bdSinglesBoxXForEnd(serverEnd, opts.serveRight);
  const startY = bdShuttleYInFrontOfPlayer(serverEnd, bdPlayerYForEnd(serverEnd));

  const endX = opts.matchDoubles
    ? bdDoublesSlotXAtEnd(receiverEnd, 0, opts.serverPlayerIndex, opts.serveRight, false)
    : bdSinglesBoxXForEnd(receiverEnd, opts.serveRight);
  const endY = bdReceiveTargetYForEnd(receiverEnd);

  return {
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    control: { x: (startX + endX) / 2, y: BD_NET_Y },
  };
}

export function bdServeOverlayGeometry(opts: {
  serverTeam: 'teamA' | 'teamB';
  courtEndsSwapped: boolean;
  serveRight: boolean;
  matchDoubles: boolean;
  serverPlayerIndex: number;
}): { ballLeftPct: number; ballTopPct: number; arrowD: string } {
  const { start, end, control } = bdServeFlatTrace(opts);
  const p = BD_VIEW_PAD;
  const arrowD = `M ${start.x + p} ${start.y + p} Q ${control.x + p} ${control.y + p} ${end.x + p} ${end.y + p}`;

  return {
    ballLeftPct: ((start.x + BD_VIEW_PAD) / BD_VB_W) * 100,
    ballTopPct: ((start.y + BD_VIEW_PAD) / BD_VB_H) * 100,
    arrowD,
  };
}
