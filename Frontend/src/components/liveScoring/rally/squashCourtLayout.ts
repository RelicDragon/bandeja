/**
 * WSF court — vertical portrait, front wall at top (9750 × 8420 mm playing surface).
 * Flat viewBox geometry in squashCourtGeometry; sqProjectFlat maps to perspective.
 */
import { serveCourtDepthAvatarScaleFromScreenY } from '../serveCourtDepthAvatarScale';
import type { CourtServeSide } from '@/utils/liveScoring/serveGuide';
import type { LiveTeamSide } from '@/utils/liveScoring';
import {
  SQ_BOX_M,
  SQ_COURT_L_M,
  SQ_COURT_W_M,
  SQ_DIAGONAL_M,
  SQ_SHORT_LINE_Y,
  SQ_SERVICE_BOX_FRONT_Y,
  SQ_SERVICE_BOX_BACK_Y,
  SQ_SURFACE,
  SQ_SURROUND,
  SQ_WALL_SCREEN_H,
  SQ_WALL_OUT_LINE_H,
  SQ_WALL_SERVICE_LINE_H,
  SQ_COURT_FLOOR,
  sqBoxCenterFlat,
  sqBoxCourtRect,
  sqCourtFloorMarkings,
  sqServiceBoxMetres,
  sqIsBackServiceZone,
  sqOppositeSide,
  sqReceiverFlat,
  sqServeSide,
  sqZone,
  type SqBoxZone,
  type SqSide,
} from './squashCourtGeometry';

export {
  SQ_BOX_M,
  SQ_LINE_M,
  SQ_COURT_W_M as SQ_COURT_W,
  SQ_COURT_L_M as SQ_COURT_L,
  SQ_DIAGONAL_M,
  SQ_HALF_W_M as SQ_HALF_X,
  SQ_SHORT_LINE_Y as SQ_SHORT_M,
  SQ_SERVICE_BOX_FRONT_Y,
  SQ_SERVICE_BOX_BACK_Y,
  SQ_SHORT_LINE_Y,
  SQ_RECEIVER_DEPTH_FRAC,
  SQ_SERVE_BALL_OFFSET_M,
} from './squashCourtGeometry';

/** Minimum screen px between server avatar centre and ball (size-6 avatar). */
export const SQ_SERVE_BALL_MIN_SCREEN_GAP = 16;

export const SQ_SCENE_CX = 52;

const CX = SQ_SCENE_CX;
/** Floor depth tuned to WSF L/W ≈ 1.16 (9.75 m ÷ 8.42 m). */
const TOP_FLOOR_Y = 40;
const BOTTOM_FLOOR_Y = 132;
/** Mild taper — squash is relatively wide; avoid needle-like front wall. */
const TOP_HW = 34;
const BOTTOM_HW = 42;
const SQ_SURROUND_M = 0.55;

type Pt = { x: number; y: number };

function flatToCourt(fx: number, fy: number): Pt {
  const { x: sx, y: sy, w: sw, h: sh } = SQ_SURFACE;
  return {
    x: ((fx - sx) / sw) * SQ_COURT_W_M,
    y: ((fy - sy) / sh) * SQ_COURT_L_M,
  };
}

function depthT(cy: number) {
  return cy / SQ_COURT_L_M;
}

function halfWidthAt(cy: number) {
  return TOP_HW + depthT(cy) * (BOTTOM_HW - TOP_HW);
}

export function sqProjectCourt(cx: number, cy: number): Pt {
  const t = depthT(cy);
  return {
    x: CX + (cx / SQ_COURT_W_M - 0.5) * 2 * halfWidthAt(cy),
    y: TOP_FLOOR_Y + t * (BOTTOM_FLOOR_Y - TOP_FLOOR_Y),
  };
}

export function sqProjectFlat(fx: number, fy: number): Pt {
  const c = flatToCourt(fx, fy);
  return sqProjectCourt(c.x, c.y);
}

const _sqAvatarDepthY = (() => {
  const { x: sx, y: sy, w: sw, h: sh } = SQ_SURFACE;
  const cx = sx + sw / 2;
  return {
    far: sqProjectFlat(cx, sy).y,
    near: sqProjectFlat(cx, sy + sh).y,
  };
})();

export function sqAvatarScaleFromScreenY(screenY: number): number {
  return serveCourtDepthAvatarScaleFromScreenY(
    screenY,
    _sqAvatarDepthY.far,
    _sqAvatarDepthY.near,
    TOP_HW,
    BOTTOM_HW
  );
}

/** @deprecated use sqProjectFlat — kept for tests */
export function sqProject(cx: number, cy: number): Pt {
  return sqProjectCourt(cx, cy);
}

export function sqProjectPoly(flatCorners: Pt[]): string {
  return flatCorners
    .map((c) => {
      const p = sqProjectFlat(c.x, c.y);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

/** Project court-metre polygon corners to screen space. */
export function sqProjectCourtPoly(corners: Pt[]): string {
  return corners
    .map((c) => {
      const p = sqProjectCourt(c.x, c.y);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

export function sqProjectRect(r: { x: number; y: number; w: number; h: number }): string {
  return sqProjectPoly([
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]);
}

export function sqProjectCourtRect(r: { x: number; y: number; w: number; h: number }): string {
  return sqProjectCourtPoly([
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]);
}

function surroundRect(): { x: number; y: number; w: number; h: number } {
  const { x: sx, y: sy, w: sw, h: sh } = SQ_SURFACE;
  const padX = (SQ_SURROUND_M / SQ_COURT_W_M) * sw;
  const padY = (SQ_SURROUND_M / SQ_COURT_L_M) * sh;
  return { x: sx - padX, y: sy - padY, w: sw + padX * 2, h: sh + padY * 2 };
}

function wallTop(base: Pt, courtY = 0): Pt {
  const h = SQ_WALL_SCREEN_H * (0.88 + depthT(courtY) * 0.16);
  return { x: base.x, y: base.y - h };
}

function polyPts(pts: Pt[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

/** Single flat side wall (floor edge → wall top). */
export type SqSideWallFace = string;

function sideWallFace(side: 'left' | 'right'): SqSideWallFace {
  const courtX = side === 'left' ? 0 : SQ_COURT_W_M;
  const front = sqProjectCourt(courtX, 0);
  const back = sqProjectCourt(courtX, SQ_COURT_L_M);
  const frontTop = wallTop(front, 0);
  const backTop = wallTop(back, SQ_COURT_L_M);
  return polyPts([front, back, backTop, frontTop]);
}

export function sqLinePaths(): string[] {
  const marks = sqCourtFloorMarkings();
  return [
    sqProjectCourtPoly(marks.shortLine),
    sqProjectCourtPoly(marks.halfLine),
    sqProjectCourtPoly(marks.leftServiceMark),
    sqProjectCourtPoly(marks.rightServiceMark),
  ];
}

export function sqSceneGeometry() {
  const s = SQ_SURFACE;
  const surround = surroundRect();
  const tl = sqProjectFlat(s.x, s.y);
  const tr = sqProjectFlat(s.x + s.w, s.y);
  const bl = sqProjectFlat(s.x, s.y + s.h);
  const br = sqProjectFlat(s.x + s.w, s.y + s.h);
  const flt = wallTop(tl, 0);
  const frt = wallTop(tr, 0);
  const leftWall = sideWallFace('left');
  const rightWall = sideWallFace('right');

  return {
    surround: sqProjectRect(surround),
    floor: sqProjectRect(s),
    leftWall,
    rightWall,
    corners: { tl, tr, bl, br },
    flt,
    frt,
  };
}

function computeSqSceneViewBox(): { minX: number; minY: number; w: number; h: number } {
  const scene = sqSceneGeometry();
  const lines = sqLinePaths();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const wallPolys = [scene.leftWall, scene.rightWall];
  for (const pts of [scene.surround, scene.floor, ...wallPolys, ...lines]) {
    for (const p of pts.split(' ')) {
      const [x, y] = p.split(',').map(Number);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  minY = Math.min(minY, scene.flt.y - 6);

  const padX = 4;
  const padTop = 4;
  const padBottom = 6;
  return {
    minX: Math.floor(minX - padX),
    minY: Math.floor(minY - padTop),
    w: Math.ceil(maxX + padX) - Math.floor(minX - padX),
    h: Math.ceil(maxY + padBottom) - Math.floor(minY - padTop),
  };
}

const _sqSceneViewBox = computeSqSceneViewBox();
export const SQ_SCENE_MIN_X = _sqSceneViewBox.minX;
export const SQ_SCENE_MIN_Y = _sqSceneViewBox.minY;
export const SQ_SCENE_VB_W = _sqSceneViewBox.w;
export const SQ_SCENE_VB_H = _sqSceneViewBox.h;
export const SQ_SCENE_VIEW_BOX = `${SQ_SCENE_MIN_X} ${SQ_SCENE_MIN_Y} ${SQ_SCENE_VB_W} ${SQ_SCENE_VB_H}`;

/** @deprecated — use SQ_SCENE_VIEW_BOX */
export const SQ_VIEW_BOX = SQ_SCENE_VIEW_BOX;
export const SQ_VB_W = SQ_SCENE_VB_W;
export const SQ_VB_H = SQ_SCENE_VB_H;

export { SQ_COURT_FLOOR, SQ_SURROUND };

export function sqScenePctFromPt(p: Pt) {
  return {
    leftPct: ((p.x - SQ_SCENE_MIN_X) / SQ_SCENE_VB_W) * 100,
    topPct: ((p.y - SQ_SCENE_MIN_Y) / SQ_SCENE_VB_H) * 100,
  };
}

export function sqBoxCenter(zone: SqBoxZone): Pt {
  const f = sqBoxCenterFlat(zone);
  return sqProjectFlat(f.x, f.y);
}

export { sqBoxCourtRect, sqServeSide, sqServiceBoxMetres };

export function sqReceiverPoint(zone: 'shortLeft' | 'shortRight'): Pt {
  const f = sqReceiverFlat(zone);
  return sqProjectFlat(f.x, f.y);
}

export function sqSceneServiceBox(zone: SqBoxZone): string {
  if (!sqIsBackServiceZone(zone)) {
    throw new Error(`sqSceneServiceBox: not a back service zone (${zone})`);
  }
  const side = zone === 'backLeft' ? 'left' : 'right';
  return sqProjectCourtRect(sqServiceBoxMetres(side));
}

export function sqServiceBoxOutlines(): { left: string; right: string } {
  return {
    left: sqProjectCourtRect(sqServiceBoxMetres('left')),
    right: sqProjectCourtRect(sqServiceBoxMetres('right')),
  };
}

export function sqTeamSide(team: LiveTeamSide, courtEndsSwapped: boolean): SqSide {
  const left = courtEndsSwapped ? team === 'teamB' : team === 'teamA';
  return left ? 'left' : 'right';
}

export function sqServePlacement(opts: {
  serverTeam: LiveTeamSide;
  courtEndsSwapped: boolean;
  courtSide: CourtServeSide;
}): {
  serverZone: 'backLeft' | 'backRight';
  receiverZone: 'shortLeft' | 'shortRight';
  server: Pt;
  receiver: Pt;
} {
  void opts.serverTeam;
  void opts.courtEndsSwapped;
  const serveRight = opts.courtSide === 'rightDeuce';
  const boxSide = sqServeSide('left', serveRight);
  const serverZone = sqZone('back', boxSide) as 'backLeft' | 'backRight';
  const receiverZone = sqZone('short', sqOppositeSide(boxSide)) as 'shortLeft' | 'shortRight';
  return {
    serverZone,
    receiverZone,
    server: sqBoxCenter(serverZone),
    receiver: sqReceiverPoint(receiverZone),
  };
}

export function sqSetupPlacement(team: LiveTeamSide, courtEndsSwapped: boolean) {
  const side = sqTeamSide(team, courtEndsSwapped);
  const zone = sqZone('back', side);
  const c = sqBoxCenter(zone);
  return { zone, x: c.x, y: c.y };
}

export type SqServeLeg = { from: Pt; to: Pt };

export type SqSceneServeTrace = {
  leg1: SqServeLeg;
  leg2: SqServeLeg;
  wallHit: Pt;
  ball: Pt;
  receiveBall: Pt;
  ballLeftPct: number;
  ballTopPct: number;
};

/** Ball contact — same x as server, toward front wall (up on screen). */
export function sqBallPointInFrontOf(player: Pt, offset = SQ_SERVE_BALL_MIN_SCREEN_GAP): Pt {
  return { x: player.x, y: player.y - offset };
}

export function sqServeBallPoint(server: Pt): Pt {
  return sqBallPointInFrontOf(server);
}

function sqFrontWallHitY(): number {
  const { x: sx, y: sy } = SQ_SURFACE;
  const fl = sqProjectFlat(sx, sy);
  const flt = wallTop(fl);
  const svcR = SQ_WALL_SERVICE_LINE_H / SQ_WALL_OUT_LINE_H;
  const serveR = svcR + (1 - svcR) * 0.42;
  return fl.y + (flt.y - fl.y) * serveR;
}

/** Front-wall x so a straight shot from ball reflects into the receive target. */
export function sqWallHitAimingAt(ball: Pt, target: Pt, wallY = sqFrontWallHitY()): Pt {
  const { x: bx, y: by } = ball;
  const { x: rx, y: ry } = target;
  if (Math.abs(bx - rx) < 1e-6) {
    return { x: bx, y: wallY };
  }
  const denom = by + ry - 2 * wallY;
  if (Math.abs(denom) < 1e-6) {
    return { x: (bx + rx) / 2, y: wallY };
  }
  const wx = (rx * (by - wallY) + bx * (ry - wallY)) / denom;
  return { x: wx, y: wallY };
}

export function sqServeArrow(opts: {
  server: Pt;
  receiver: Pt;
  receiverZone: 'shortLeft' | 'shortRight';
}): SqSceneServeTrace {
  void opts.receiverZone;
  let ball = sqServeBallPoint(opts.server);
  if (opts.server.y - ball.y < SQ_SERVE_BALL_MIN_SCREEN_GAP - 0.5) {
    ball = { x: ball.x, y: opts.server.y - SQ_SERVE_BALL_MIN_SCREEN_GAP };
  }
  const receiveBall = sqBallPointInFrontOf(opts.receiver);
  const wallHit = sqWallHitAimingAt(ball, receiveBall);
  const leg1: SqServeLeg = { from: ball, to: wallHit };
  const leg2: SqServeLeg = { from: wallHit, to: receiveBall };
  const pct = sqScenePctFromPt(ball);
  return {
    leg1,
    leg2,
    wallHit,
    ball,
    receiveBall,
    ballLeftPct: pct.leftPct,
    ballTopPct: pct.topPct,
  };
}

export function sqServeLinePath(from: Pt, to: Pt, t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const x = from.x + (to.x - from.x) * u;
  const y = from.y + (to.y - from.y) * u;
  return `M ${from.x} ${from.y} L ${x} ${y}`;
}

export function sqLegPointAt(leg: SqServeLeg, t: number): Pt {
  const u = Math.max(0, Math.min(1, t));
  return {
    x: leg.from.x + (leg.to.x - leg.from.x) * u,
    y: leg.from.y + (leg.to.y - leg.from.y) * u,
  };
}

export function sqSceneServeOverlay(opts: {
  serverZone: 'backLeft' | 'backRight';
  receiverZone: 'shortLeft' | 'shortRight';
}): SqSceneServeTrace {
  const server = sqBoxCenter(opts.serverZone);
  const receiver = sqReceiverPoint(opts.receiverZone);
  return sqServeArrow({ server, receiver, receiverZone: opts.receiverZone });
}

export function sqLayoutMetrics() {
  return {
    courtW: SQ_COURT_W_M,
    courtL: SQ_COURT_L_M,
    diagonal: SQ_DIAGONAL_M,
    shortLineY: SQ_SHORT_LINE_Y,
    shortFromBack: SQ_COURT_L_M - SQ_SHORT_LINE_Y,
    shortFromFront: SQ_SHORT_LINE_Y,
    boxSize: SQ_BOX_M,
    serviceBoxFrontY: SQ_SERVICE_BOX_FRONT_Y,
    serviceBoxBackY: SQ_SERVICE_BOX_BACK_Y,
    receiveBoxFrontY: 0,
    receiveBoxBackY: SQ_SHORT_LINE_Y,
  };
}
