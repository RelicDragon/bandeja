/** Portrait end view: play length vertical (ITTF ~274 × 152.5 cm). */
export const TT_TABLE_L_M = 2.74;
export const TT_TABLE_W_M = 1.525;

export const TT_VIEW_BOX = '0 0 168 296';
export const TT_VB_W = 168;
export const TT_VB_H = 296;

export const TT_FRAME = { x: 20, y: 44, w: 128, h: 218, rx: 8 };
export const TT_SURFACE = { x: 24, y: 48, w: 120, h: 210, rx: 4 };

const { x: sx, y: sy, w: sw, h: sh } = TT_SURFACE;
/** Flat SVG units per metre along the table length axis. */
export const TT_FLAT_UNITS_PER_M = sh / TT_TABLE_L_M;
export const TT_CENTER_X = sx + sw / 2;
export const TT_NET_Y = sy + sh / 2;

/** Serve-box centers (arrow target on receiver side). */
export const TT_TOP_BOX_Y = sy + sh * 0.22;
export const TT_BOTTOM_BOX_Y = sy + sh * 0.78;

/** Ball on table, server baseline area (closer to player than box center, still on surface). */
export const TT_BALL_TOP_Y = sy + sh * 0.07;
export const TT_BALL_BOTTOM_Y = sy + sh * 0.93;

/** Player avatars sit outside the table frame. */
export const TT_PLAYER_TOP_Y = TT_FRAME.y - 10;
export const TT_PLAYER_BOTTOM_Y = TT_FRAME.y + TT_FRAME.h + 10;

export const TT_LEFT_X = sx + sw * 0.25;
export const TT_RIGHT_X = sx + sw * 0.75;

export function ttPlayerYForEnd(end: 'top' | 'bottom'): number {
  return end === 'top' ? TT_PLAYER_TOP_Y : TT_PLAYER_BOTTOM_Y;
}

export function ttBoxYForEnd(end: 'top' | 'bottom'): number {
  return end === 'top' ? TT_TOP_BOX_Y : TT_BOTTOM_BOX_Y;
}

/** Ball on the server's end of the table, nearer the player than the box center. */
export function ttBallYForServerEnd(end: 'top' | 'bottom'): number {
  return end === 'top' ? TT_BALL_TOP_Y : TT_BALL_BOTTOM_Y;
}

/** Singles service box X for an end (player faces the net; their right ≠ fixed screen right). */
export function ttSinglesBoxXForEnd(end: 'top' | 'bottom', serveRight: boolean): number {
  if (serveRight) return end === 'top' ? TT_LEFT_X : TT_RIGHT_X;
  return end === 'top' ? TT_RIGHT_X : TT_LEFT_X;
}

export function ttSinglesQuadrantSide(end: 'top' | 'bottom', serveRight: boolean): 'left' | 'right' {
  return ttSinglesBoxXForEnd(end, serveRight) < TT_CENTER_X ? 'left' : 'right';
}

export function ttDoublesSlotXForEnd(end: 'top' | 'bottom', idx: number): number {
  if (end === 'top') return idx === 0 ? TT_RIGHT_X : TT_LEFT_X;
  return idx === 0 ? TT_LEFT_X : TT_RIGHT_X;
}

export function ttPlayerXForSlot(
  end: 'top' | 'bottom',
  idx: number,
  matchDoubles: boolean,
  serveRight: boolean,
  layoutServeBoxes: boolean
): number {
  if (matchDoubles) return ttDoublesSlotXForEnd(end, idx);
  if (layoutServeBoxes) return ttSinglesBoxXForEnd(end, serveRight);
  return TT_CENTER_X;
}

export function ttServerEnd(
  serverTeam: 'teamA' | 'teamB',
  courtEndsSwapped: boolean
): 'top' | 'bottom' {
  const serverOnTop = courtEndsSwapped ? serverTeam === 'teamA' : serverTeam === 'teamB';
  return serverOnTop ? 'top' : 'bottom';
}

export function ttServiceQuadrantRect(
  end: 'top' | 'bottom',
  side: 'left' | 'right'
): { x: number; y: number; w: number; h: number } {
  const halfW = TT_SURFACE.w / 2;
  const halfH = TT_SURFACE.h / 2;
  const x = side === 'left' ? TT_SURFACE.x : TT_CENTER_X;
  const y = end === 'top' ? TT_SURFACE.y : TT_NET_Y;
  return { x, y, w: halfW, h: halfH };
}

export type TtServeFlatTrace = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  control: { x: number; y: number };
};

/** Receiver slot on the opposite end (matches ttServeFlatTrace). */
export function ttServeArcReceiverPlayerIndex(opts: { matchDoubles: boolean; serverPlayerIndex: number }): number {
  if (!opts.matchDoubles) return 0;
  return opts.serverPlayerIndex === 0 ? 1 : 0;
}

export function ttServeFlatTrace(opts: {
  serverTeam: 'teamA' | 'teamB';
  courtEndsSwapped: boolean;
  serveRight: boolean;
  matchDoubles: boolean;
  serverPlayerIndex: number;
}): TtServeFlatTrace {
  const serverEnd = ttServerEnd(opts.serverTeam, opts.courtEndsSwapped);
  const receiverEnd = serverEnd === 'top' ? 'bottom' : 'top';

  const startX = opts.matchDoubles
    ? ttDoublesSlotXForEnd(serverEnd, opts.serverPlayerIndex)
    : ttSinglesBoxXForEnd(serverEnd, opts.serveRight);
  const startY = ttBallYForServerEnd(serverEnd);

  const receiverIdx = ttServeArcReceiverPlayerIndex({
    matchDoubles: opts.matchDoubles,
    serverPlayerIndex: opts.serverPlayerIndex,
  });
  const endX = opts.matchDoubles
    ? ttDoublesSlotXForEnd(receiverEnd, receiverIdx)
    : ttSinglesBoxXForEnd(receiverEnd, opts.serveRight);
  const endY = ttBoxYForEnd(receiverEnd);

  return {
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    control: { x: (startX + endX) / 2, y: TT_NET_Y },
  };
}

/** Legacy flat overlay — prefer ttSceneServeOverlay in tableTennisCourtLayout. */
export function ttServeOverlayGeometry(opts: Parameters<typeof ttServeFlatTrace>[0]): {
  ballLeftPct: number;
  ballTopPct: number;
  arrowD: string;
} {
  const { start, end, control } = ttServeFlatTrace(opts);
  const arrowD = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
  return {
    ballLeftPct: (start.x / TT_VB_W) * 100,
    ballTopPct: (start.y / TT_VB_H) * 100,
    arrowD,
  };
}
