/** Regulation half-court depth (baseline to net), feet. */
export const PICKLEBALL_HALF_COURT_FT = 22;
/** Non-volley zone depth from the net, feet. */
export const PICKLEBALL_NVZ_DEPTH_FT = 7;
/** Service box depth (baseline to NVZ line), feet. */
export const PICKLEBALL_SERVICE_BOX_FT = PICKLEBALL_HALF_COURT_FT - PICKLEBALL_NVZ_DEPTH_FT;

export const PICKLEBALL_COURT_VIEW_BOX = '0 0 100 200';
export const PICKLEBALL_VB_W = 100;
export const PICKLEBALL_VB_H = 200;
/** Extra viewBox space so baseline avatars (r≈14) are not clipped. */
export const PB_AVATAR_PAD_Y = 16;
export const PB_VIEW_BOX_MIN_Y = -PB_AVATAR_PAD_Y;
export const PICKLEBALL_VIEW_BOX_H = PICKLEBALL_VB_H + 2 * PB_AVATAR_PAD_Y;
export const PICKLEBALL_COURT_VIEW_BOX_PADDED = `0 ${PB_VIEW_BOX_MIN_Y} ${PICKLEBALL_VB_W} ${PICKLEBALL_VIEW_BOX_H}`;
export const PICKLEBALL_COURT_INSET = 2;
export const PICKLEBALL_NET_Y = 100;

export const PICKLEBALL_SURFACE = {
  x: PICKLEBALL_COURT_INSET,
  y: PICKLEBALL_COURT_INSET,
  w: PICKLEBALL_VB_W - 2 * PICKLEBALL_COURT_INSET,
  h: PICKLEBALL_VB_H - 2 * PICKLEBALL_COURT_INSET,
  rx: 3,
};

const { x: sx, y: sy, w: sw, h: sh } = PICKLEBALL_SURFACE;
export const PB_CENTER_X = sx + sw / 2;

/** Playable half-court depth in viewBox units (inset baseline to net). */
export const PICKLEBALL_HALF_COURT_UNITS = PICKLEBALL_NET_Y - PICKLEBALL_COURT_INSET;

/** Center of each 10 ft service box (court is 20 ft wide). */
export const PB_LEFT_BOX_X = sx + sw * 0.25;
export const PB_RIGHT_BOX_X = sx + sw * 0.75;

/** Kitchen / NVZ boundary as distance from the net toward the baseline (viewBox units). */
export function pickleballNvzOffsetFromNet(halfCourtUnits = PICKLEBALL_HALF_COURT_UNITS): number {
  return (PICKLEBALL_NVZ_DEPTH_FT / PICKLEBALL_HALF_COURT_FT) * halfCourtUnits;
}

/** Y coordinate of the NVZ back line on the given side of the net. */
export function pickleballNvzLineY(
  side: 'top' | 'bottom',
  netY = PICKLEBALL_NET_Y,
  halfCourtUnits = PICKLEBALL_HALF_COURT_UNITS
): number {
  const offset = pickleballNvzOffsetFromNet(halfCourtUnits);
  return side === 'top' ? netY - offset : netY + offset;
}

export const PB_NVZ_TOP_Y = pickleballNvzLineY('top');
export const PB_NVZ_BOTTOM_Y = pickleballNvzLineY('bottom');

/** Baseline depth fraction — players stand just inside the back line. */
const BASELINE_FRAC = 0.1;
/** Serve contact — between baseline row and NVZ (in front of player, toward net). */
const SERVE_BALL_FRAC = 0.42;

/** Y at the baseline on each end (all players on that end share this row). */
export function pbBaselineYForEnd(end: 'top' | 'bottom'): number {
  if (end === 'top') return sy + (PB_NVZ_TOP_Y - sy) * BASELINE_FRAC;
  return PB_NVZ_BOTTOM_Y + (sy + sh - PB_NVZ_BOTTOM_Y) * (1 - BASELINE_FRAC);
}

/** Serve contact — in front of the baseline row, toward the net. */
export function pbServeBallYForEnd(end: 'top' | 'bottom'): number {
  if (end === 'top') return sy + (PB_NVZ_TOP_Y - sy) * SERVE_BALL_FRAC;
  return PB_NVZ_BOTTOM_Y + (sy + sh - PB_NVZ_BOTTOM_Y) * (1 - SERVE_BALL_FRAC);
}

/** Diagonal landing zone — mid service box beyond the kitchen. */
export function pbReceiveTargetYForEnd(end: 'top' | 'bottom'): number {
  if (end === 'top') return sy + (PB_NVZ_TOP_Y - sy) * 0.42;
  return PB_NVZ_BOTTOM_Y + (sy + sh - PB_NVZ_BOTTOM_Y) * 0.58;
}

export const PB_PLAYER_TOP_Y = sy - 12;
export const PB_PLAYER_BOTTOM_Y = sy + sh + 12;

export function pbServerEnd(
  serverTeam: 'teamA' | 'teamB',
  courtEndsSwapped: boolean
): 'top' | 'bottom' {
  const serverOnTop = courtEndsSwapped ? serverTeam === 'teamA' : serverTeam === 'teamB';
  return serverOnTop ? 'top' : 'bottom';
}

/** Singles service box X — server faces net; their right ≠ fixed screen right. */
export function pbSinglesBoxXForEnd(end: 'top' | 'bottom', serveRight: boolean): number {
  if (serveRight) return end === 'top' ? PB_LEFT_BOX_X : PB_RIGHT_BOX_X;
  return end === 'top' ? PB_RIGHT_BOX_X : PB_LEFT_BOX_X;
}

export function pbSinglesQuadrantSide(end: 'top' | 'bottom', serveRight: boolean): 'left' | 'right' {
  return pbSinglesBoxXForEnd(end, serveRight) < PB_CENTER_X ? 'left' : 'right';
}

export function pbDoublesSlotXAtEnd(
  end: 'top' | 'bottom',
  idx: number,
  serverPlayerIndex: number,
  serveRight: boolean,
  isServerEnd: boolean
): number {
  const serveX = pbSinglesBoxXForEnd(end, serveRight);
  const otherX = pbSinglesBoxXForEnd(end, !serveRight);
  if (isServerEnd) {
    return idx === serverPlayerIndex ? serveX : otherX;
  }
  return idx === 0 ? serveX : otherX;
}

/** Baseline left/right for doubles when not in active serve placement. */
export function pbDoublesMirroredBaselineX(idx: number, teamMirrored: boolean): number {
  const left = PB_LEFT_BOX_X;
  const right = PB_RIGHT_BOX_X;
  const p0 = teamMirrored ? left : right;
  const p1 = teamMirrored ? right : left;
  return idx === 0 ? p0 : p1;
}

export function pbPlayerXForSlot(
  end: 'top' | 'bottom',
  idx: number,
  matchDoubles: boolean,
  serveRight: boolean,
  layoutServeBoxes: boolean,
  serverPlayerIndex: number,
  serverEnd: 'top' | 'bottom',
  opts?: {
    team?: 'teamA' | 'teamB';
    serverTeam?: 'teamA' | 'teamB';
    teamMirrored?: boolean;
    endsSetup?: boolean;
  }
): number {
  if (!layoutServeBoxes) return PB_CENTER_X;
  if (matchDoubles) {
    const teamMirrored = opts?.teamMirrored ?? false;
    const endsSetup = opts?.endsSetup ?? false;
    if (endsSetup) {
      return pbDoublesMirroredBaselineX(idx, teamMirrored);
    }
    const isServerEnd = end === serverEnd;
    return pbDoublesSlotXAtEnd(end, idx, serverPlayerIndex, serveRight, isServerEnd);
  }
  return pbSinglesBoxXForEnd(end, serveRight);
}

export function pbPlayerYForEnd(end: 'top' | 'bottom', layoutServeBoxes: boolean): number {
  if (!layoutServeBoxes) return end === 'top' ? PB_PLAYER_TOP_Y : PB_PLAYER_BOTTOM_Y;
  return pbBaselineYForEnd(end);
}

export type PbServeFlatPoints = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  control: { x: number; y: number };
};

/** Receiver slot on the opposite end (matches pbServeFlatPoints). */
export function pbServeArcReceiverPlayerIndex(_opts: { matchDoubles: boolean }): number {
  return 0;
}

export function pbServeFlatPoints(opts: {
  serverTeam: 'teamA' | 'teamB';
  courtEndsSwapped: boolean;
  serveRight: boolean;
  matchDoubles: boolean;
  serverPlayerIndex: number;
}): PbServeFlatPoints {
  const serverEnd = pbServerEnd(opts.serverTeam, opts.courtEndsSwapped);
  const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';

  const startX = opts.matchDoubles
    ? pbDoublesSlotXAtEnd(serverEnd, opts.serverPlayerIndex, opts.serverPlayerIndex, opts.serveRight, true)
    : pbSinglesBoxXForEnd(serverEnd, opts.serveRight);
  const startY = pbServeBallYForEnd(serverEnd);

  const endX = opts.matchDoubles
    ? pbDoublesSlotXAtEnd(receiverEnd, 0, opts.serverPlayerIndex, opts.serveRight, false)
    : pbSinglesBoxXForEnd(receiverEnd, opts.serveRight);
  const endY = pbReceiveTargetYForEnd(receiverEnd);

  return {
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    control: { x: (startX + endX) / 2, y: PICKLEBALL_NET_Y },
  };
}

export function pbServeOverlayGeometry(opts: {
  serverTeam: 'teamA' | 'teamB';
  courtEndsSwapped: boolean;
  serveRight: boolean;
  matchDoubles: boolean;
  serverPlayerIndex: number;
}): { ballLeftPct: number; ballTopPct: number; arrowD: string } {
  const { start, end, control } = pbServeFlatPoints(opts);
  const arrowD = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;

  return {
    ballLeftPct: (start.x / PICKLEBALL_VB_W) * 100,
    ballTopPct: ((start.y - PB_VIEW_BOX_MIN_Y) / PICKLEBALL_VIEW_BOX_H) * 100,
    arrowD,
  };
}

export function pbServiceBoxRect(
  end: 'top' | 'bottom',
  side: 'left' | 'right'
): { x: number; y: number; w: number; h: number } {
  const halfW = sw / 2;
  const x = side === 'left' ? sx : PB_CENTER_X;
  const y = end === 'top' ? sy : PB_NVZ_BOTTOM_Y;
  const boxH = end === 'top' ? PB_NVZ_TOP_Y - sy : sy + sh - PB_NVZ_BOTTOM_Y;
  return { x, y, w: halfW, h: boxH };
}

/** USAPA-style court blue (playing surface). */
export const PB_COURT_BLUE = { top: '#1a73c7', bottom: '#1565b8' };
/** Out-of-bounds / surround green seen on many outdoor courts. */
export const PB_SURROUND_GREEN = { top: '#3d7a45', bottom: '#2f6636' };
