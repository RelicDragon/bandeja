/**
 * WSF court floor (metres, front wall y = 0) — dimensions from official WSF diagram:
 * 9750 × 8420 mm playing surface, 5440 mm front→short line, 1600 mm service boxes, 2610 mm box→back.
 */
export const SQ_COURT_W_M = 8.42;
export const SQ_COURT_L_M = 9.75;
export const SQ_BOX_M = 1.6;
export const SQ_LINE_M = 0.05;
export const SQ_GAP_TO_HALF_M = 2.535;
export const SQ_BACK_TAIL_M = 2.61;
export const SQ_DIAGONAL_M = Math.hypot(SQ_COURT_W_M, SQ_COURT_L_M);

/** Front wall → near edge of short line (5440 mm). */
export const SQ_SHORT_LINE_Y = 5.44;
/** Service box front edge — after 50 mm short line (5490 mm). */
export const SQ_SERVICE_BOX_FRONT_Y = SQ_SHORT_LINE_Y + SQ_LINE_M;
export const SQ_SERVICE_BOX_BACK_Y = SQ_SERVICE_BOX_FRONT_Y + SQ_BOX_M;

export const SQ_HALF_W_M = SQ_COURT_W_M / 2;
export const SQ_SURROUND_M = 0.55;

/**
 * WSF front-wall marks — vertical measure from finished floor to underside of line,
 * except tin top which is to the upper edge of the board (WSF court specs).
 */
/** Lower edge of front wall (out) line — 4570 mm. */
export const SQ_WALL_OUT_LINE_H = 4.57;
/** Lower edge of service line — 1780 mm. */
export const SQ_WALL_SERVICE_LINE_H = 1.78;
/** Top of tin / upper edge of board — 480 mm standard (430 mm PSA). */
export const SQ_WALL_TIN_TOP_H = 0.48;
/** Minimum clear height above floor — 5640 mm (envelope, not a playing line). */
export const SQ_WALL_CEILING_CLEAR_M = 5.64;

export const SQ_SCALE = 20;
const u = (m: number) => m * SQ_SCALE;

/** Perspective wall height in screen px — shared with front wall. */
export const SQ_WALL_SCREEN_H = 54;

export const SQ_RECEIVER_DEPTH_FRAC = 0.35;
export const SQ_SERVE_BALL_OFFSET_M = 0.42;

export const SQ_COURT_FLOOR = { top: '#edf1f5', bottom: '#b8c4d4' };
export const SQ_SURROUND = { top: '#8b9cb0', bottom: '#6b7c94' };

const pad = u(0.25);
export const SQ_SURFACE = {
  x: pad,
  y: pad,
  w: u(SQ_COURT_W_M),
  h: u(SQ_COURT_L_M),
};

export type SqSide = 'left' | 'right';
export type SqBoxZone = 'backLeft' | 'backRight' | 'shortLeft' | 'shortRight';

export type SqCourtRect = { x: number; y: number; w: number; h: number };

export function sqIsBackServiceZone(zone: SqBoxZone): zone is 'backLeft' | 'backRight' {
  return zone === 'backLeft' || zone === 'backRight';
}

export function sqZone(half: 'back' | 'short', side: SqSide): SqBoxZone {
  return half === 'back'
    ? side === 'left'
      ? 'backLeft'
      : 'backRight'
    : side === 'left'
      ? 'shortLeft'
      : 'shortRight';
}

export function sqOppositeSide(side: SqSide): SqSide {
  return side === 'left' ? 'right' : 'left';
}

/** Court-absolute left/right when facing the front wall (even score → right box). */
export function sqServeSide(_facing: SqSide, serveRight: boolean): SqSide {
  return serveRight ? 'right' : 'left';
}

/** WSF 1600 × 1600 mm box behind the short line. */
export function sqServiceBoxMetres(side: SqSide): SqCourtRect {
  const x = side === 'left' ? 0 : SQ_COURT_W_M - SQ_BOX_M;
  return { x, y: SQ_SERVICE_BOX_FRONT_Y, w: SQ_BOX_M, h: SQ_BOX_M };
}

export function sqBoxCourtRect(zone: SqBoxZone): SqCourtRect {
  if (zone === 'backLeft') return sqServiceBoxMetres('left');
  if (zone === 'backRight') return sqServiceBoxMetres('right');
  const side = zone === 'shortLeft' ? 'left' : 'right';
  const x = side === 'left' ? 0 : SQ_COURT_W_M - SQ_BOX_M;
  const y = SQ_SHORT_LINE_Y * SQ_RECEIVER_DEPTH_FRAC;
  return { x, y, w: SQ_BOX_M, h: SQ_BOX_M };
}

const { x: sx, y: sy, w: sw, h: sh } = SQ_SURFACE;

function courtToFlat(cx: number, cy: number) {
  return {
    x: sx + (cx / SQ_COURT_W_M) * sw,
    y: sy + (cy / SQ_COURT_L_M) * sh,
  };
}

export function sqBoxCenterFlat(zone: SqBoxZone): { x: number; y: number } {
  const b = sqBoxCourtRect(zone);
  return courtToFlat(b.x + b.w / 2, b.y + b.h / 2);
}

export function sqReceiverFlat(zone: 'shortLeft' | 'shortRight'): { x: number; y: number } {
  const side = zone === 'shortLeft' ? 'left' : 'right';
  const x = side === 'left' ? SQ_COURT_W_M * 0.25 : SQ_COURT_W_M * 0.75;
  const y = SQ_SHORT_LINE_Y * SQ_RECEIVER_DEPTH_FRAC;
  return courtToFlat(x, y);
}

/** WSF floor markings in court metres (for perspective projection). */
export function sqCourtFloorMarkings(): {
  outline: { x: number; y: number }[];
  shortLine: { x: number; y: number }[];
  halfLine: { x: number; y: number }[];
  leftServiceMark: { x: number; y: number }[];
  rightServiceMark: { x: number; y: number }[];
} {
  const boxBackY = SQ_SERVICE_BOX_BACK_Y;

  return {
    outline: [
      { x: 0, y: 0 },
      { x: SQ_COURT_W_M, y: 0 },
      { x: SQ_COURT_W_M, y: SQ_COURT_L_M },
      { x: 0, y: SQ_COURT_L_M },
    ],
    shortLine: [
      { x: 0, y: SQ_SHORT_LINE_Y },
      { x: SQ_COURT_W_M, y: SQ_SHORT_LINE_Y },
    ],
    halfLine: [
      { x: SQ_HALF_W_M, y: SQ_SHORT_LINE_Y },
      { x: SQ_HALF_W_M, y: SQ_COURT_L_M },
    ],
    leftServiceMark: [
      { x: 0, y: SQ_COURT_L_M },
      { x: 0, y: boxBackY },
      { x: SQ_BOX_M, y: boxBackY },
      { x: SQ_BOX_M, y: SQ_SHORT_LINE_Y },
      { x: SQ_HALF_W_M, y: SQ_SHORT_LINE_Y },
    ],
    rightServiceMark: [
      { x: SQ_COURT_W_M, y: SQ_COURT_L_M },
      { x: SQ_COURT_W_M, y: boxBackY },
      { x: SQ_COURT_W_M - SQ_BOX_M, y: boxBackY },
      { x: SQ_COURT_W_M - SQ_BOX_M, y: SQ_SHORT_LINE_Y },
      { x: SQ_HALF_W_M, y: SQ_SHORT_LINE_Y },
    ],
  };
}

export function sqServeArcControlY(startY: number, endY: number): number {
  return Math.min(startY, endY) - Math.max(12, Math.abs(startY - endY) * 0.22);
}

export function sqServeFlatTrace(opts: {
  serverZone: 'backLeft' | 'backRight';
  receiverZone: 'shortLeft' | 'shortRight';
}): { start: { x: number; y: number }; end: { x: number; y: number }; control: { x: number; y: number } } {
  const server = sqBoxCenterFlat(opts.serverZone);
  const receiver = sqReceiverFlat(opts.receiverZone);
  const towardFront = -SQ_SERVE_BALL_OFFSET_M / SQ_COURT_L_M;
  const start = {
    x: server.x,
    y: server.y + towardFront * sh,
  };
  return {
    start,
    end: receiver,
    control: {
      x: (start.x + receiver.x) / 2,
      y: sqServeArcControlY(start.y, receiver.y),
    },
  };
}
