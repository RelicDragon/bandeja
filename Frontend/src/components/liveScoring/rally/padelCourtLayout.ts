/**
 * Padel court — vertical portrait, camera above near baseline (mirrors pickleballCourtLayout).
 */
import {
  serveCourtDepthAvatarScaleFromFlatY,
  serveCourtDepthAvatarScaleFromScreenY,
} from '../serveCourtDepthAvatarScale';
import {
  serveArcControlPerpendicular,
  serveArcPathPartial,
  serveArcQuadPoint,
  serveArcQuadraticD,
} from './serveArcGeometry';
import {
  PADEL_NET_Y,
  PADEL_SURFACE,
  PD_CENTER_X,
  PD_COURT_BLUE,
  PD_Y_BASELINE_BOTTOM,
  PD_Y_BASELINE_TOP,
  PD_PLAYER_BOTTOM_Y,
  PD_PLAYER_TOP_Y,
  PD_SERVICE_BOTTOM_Y,
  PD_SERVICE_TOP_Y,
  PD_SURROUND,
  PD_X_L,
  PD_X_R,
  pdActiveServiceBoxSide,
  pdServeFlatPoints,
  pdServerEnd,
  pdServiceBoxRect,
} from './padelCourtGeometry';

/** Perpendicular bulge for padel serve arc — keep low for a fairly straight throw line. */
const PD_SERVE_ARC_MIN_BULGE = 7;
const PD_SERVE_ARC_BULGE_FACTOR = 0.12;

export const PADEL_COURT_BLUE = PD_COURT_BLUE;
export const PADEL_SURROUND = PD_SURROUND;

export const PD_COURT_W_M = 10;
export const PD_COURT_L_M = 20;
export const PD_SURROUND_M = 1.5;

export const PD_SCENE_CX = 56;

const CX = PD_SCENE_CX;
const TOP_FLOOR_Y = 30;
const BOTTOM_FLOOR_Y = 194;
const TOP_HW = 35;
/** Near POV baseline — slightly stronger than pickleball (47) so bottom row reads closer. */
const BOTTOM_HW = 54;
/** No enclosure on near baseline (open toward POV). */
const NEAR_OPEN_M = 1.2;
const PD_WALL_BACK_H = 38;
const PD_WALL_SIDE_H = 24;
/** Back wall: glass 3 m + mesh 1 m (of 4 m total). */
const PD_BACK_MESH_FRAC = 0.25;

type Pt = { x: number; y: number };

function polyPts(pts: Pt[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function wallTopSide(base: Pt, courtYM: number): Pt {
  const t = depthT(courtYM);
  const h = PD_WALL_SIDE_H * (0.82 + t * 0.22);
  return { x: base.x, y: base.y - h };
}

function wallTopBack(base: Pt): Pt {
  return { x: base.x, y: base.y - PD_WALL_BACK_H };
}

function flatToCourt(fx: number, fy: number): Pt {
  const { x: sx, y: sy, w: sw, h: sh } = PADEL_SURFACE;
  return {
    x: ((fx - sx) / sw) * PD_COURT_W_M,
    y: ((fy - sy) / sh) * PD_COURT_L_M,
  };
}

function depthT(cy: number) {
  return cy / PD_COURT_L_M;
}

function halfWidthAt(cy: number) {
  return TOP_HW + depthT(cy) * (BOTTOM_HW - TOP_HW);
}

export function pdProjectCourt(cx: number, cy: number): Pt {
  const t = depthT(cy);
  return {
    x: CX + (cx / PD_COURT_W_M - 0.5) * 2 * halfWidthAt(cy),
    y: TOP_FLOOR_Y + t * (BOTTOM_FLOOR_Y - TOP_FLOOR_Y),
  };
}

export function pdProjectFlat(fx: number, fy: number): Pt {
  const c = flatToCourt(fx, fy);
  return pdProjectCourt(c.x, c.y);
}

const _pdAvatarDepth = (() => {
  const cx = PD_CENTER_X;
  const farFlat = PD_Y_BASELINE_TOP;
  const nearFlat = PD_Y_BASELINE_BOTTOM;
  return {
    farFlat,
    flatSpan: nearFlat - farFlat,
    farScreen: pdProjectFlat(cx, farFlat).y,
    nearScreen: pdProjectFlat(cx, nearFlat).y,
  };
})();

export function pdAvatarScaleFromFlatY(flatY: number): number {
  return serveCourtDepthAvatarScaleFromFlatY(
    flatY,
    _pdAvatarDepth.farFlat,
    _pdAvatarDepth.flatSpan,
    TOP_HW,
    BOTTOM_HW
  );
}

/** Perspective scale from projected screen Y (matches court widening toward POV). */
export function pdAvatarScaleFromScreenY(screenY: number): number {
  return serveCourtDepthAvatarScaleFromScreenY(
    screenY,
    _pdAvatarDepth.farScreen,
    _pdAvatarDepth.nearScreen,
    TOP_HW,
    BOTTOM_HW
  );
}

export function pdProjectPoly(flatCorners: Pt[]): string {
  return flatCorners
    .map((c) => {
      const p = pdProjectFlat(c.x, c.y);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

export function pdProjectRect(r: { x: number; y: number; w: number; h: number }): string {
  return pdProjectPoly([
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]);
}

function surroundRect(): { x: number; y: number; w: number; h: number } {
  const { x: sx, y: sy, w: sw, h: sh } = PADEL_SURFACE;
  const padX = (PD_SURROUND_M / PD_COURT_W_M) * sw;
  const padY = (PD_SURROUND_M / PD_COURT_L_M) * sh;
  return { x: sx - padX, y: sy - padY, w: sw + padX * 2, h: sh + padY * 2 };
}

/** Flat wall plane on court sideline (squash-style), ending before near baseline. */
function sideWallFace(side: 'left' | 'right'): string {
  const courtX = side === 'left' ? 0 : PD_COURT_W_M;
  const yEnd = PD_COURT_L_M - NEAR_OPEN_M;
  const back = pdProjectCourt(courtX, 0);
  const front = pdProjectCourt(courtX, yEnd);
  const backTop = wallTopSide(back, 0);
  const frontTop = wallTopSide(front, yEnd);
  return polyPts([back, front, frontTop, backTop]);
}

export type PdBackWallScene = {
  glass: string;
  mesh: string;
  crestLine: { x1: number; y1: number; x2: number; y2: number };
  mullions: { x1: number; y1: number; x2: number; y2: number }[];
};

export function pdBackWallScene(): PdBackWallScene {
  const s = PADEL_SURFACE;
  const fl = pdProjectFlat(s.x, s.y);
  const fr = pdProjectFlat(s.x + s.w, s.y);
  const flt = wallTopBack(fl);
  const frt = wallTopBack(fr);
  const meshT = 1 - PD_BACK_MESH_FRAC;
  const flMesh = lerpPt(fl, flt, meshT);
  const frMesh = lerpPt(fr, frt, meshT);

  const mullions = [0.25, 0.5, 0.75].map((t) => {
    const base = lerpPt(fl, fr, t);
    const top = lerpPt(flt, frt, t);
    return { x1: base.x, y1: base.y, x2: top.x, y2: top.y };
  });

  return {
    glass: polyPts([fl, fr, frMesh, flMesh]),
    mesh: polyPts([flMesh, frMesh, frt, flt]),
    crestLine: { x1: flt.x, y1: flt.y, x2: frt.x, y2: frt.y },
    mullions,
  };
}

export function pdSceneGeometry() {
  const s = PADEL_SURFACE;
  const surround = surroundRect();
  const tl = pdProjectFlat(s.x, s.y);
  const tr = pdProjectFlat(s.x + s.w, s.y);
  const bl = pdProjectFlat(s.x, s.y + s.h);
  const br = pdProjectFlat(s.x + s.w, s.y + s.h);

  return {
    surround: pdProjectRect(surround),
    floor: pdProjectRect(s),
    leftWall: sideWallFace('left'),
    rightWall: sideWallFace('right'),
    backWall: pdBackWallScene(),
    corners: { tl, tr, bl, br },
    net: pdNetLayout(),
  };
}

export type PdNetLayout = {
  left: Pt;
  right: Pt;
  floorY: number;
  span: number;
  centerX: number;
};

export function pdNetLayout(): PdNetLayout {
  const s = PADEL_SURFACE;
  const left = pdProjectFlat(s.x, PADEL_NET_Y);
  const right = pdProjectFlat(s.x + s.w, PADEL_NET_Y);
  return {
    left,
    right,
    floorY: left.y,
    span: right.x - left.x,
    centerX: (left.x + right.x) / 2,
  };
}

export function pdLinePaths(): string[] {
  const s = PADEL_SURFACE;
  const { x: sx, y: sy, w: sw, h: sh } = s;

  const outline = pdProjectPoly([
    { x: sx, y: sy },
    { x: sx + sw, y: sy },
    { x: sx + sw, y: sy + sh },
    { x: sx, y: sy + sh },
    { x: sx, y: sy },
  ]);

  const serviceTop = pdProjectPoly([
    { x: sx, y: PD_SERVICE_TOP_Y },
    { x: sx + sw, y: PD_SERVICE_TOP_Y },
  ]);
  const serviceBottom = pdProjectPoly([
    { x: sx, y: PD_SERVICE_BOTTOM_Y },
    { x: sx + sw, y: PD_SERVICE_BOTTOM_Y },
  ]);
  const centerTop = pdProjectPoly([
    { x: PD_CENTER_X, y: PD_SERVICE_TOP_Y },
    { x: PD_CENTER_X, y: PADEL_NET_Y },
  ]);
  const centerBottom = pdProjectPoly([
    { x: PD_CENTER_X, y: PADEL_NET_Y },
    { x: PD_CENTER_X, y: PD_SERVICE_BOTTOM_Y },
  ]);

  return [outline, serviceTop, serviceBottom, centerTop, centerBottom];
}

function collectBounds(pts: string): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts.split(' ')) {
    const [x, y] = p.split(',').map(Number);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function computePdSceneViewBox(): { minX: number; minY: number; w: number; h: number } {
  const scene = pdSceneGeometry();
  const lines = pdLinePaths();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const merge = (b: ReturnType<typeof collectBounds>) => {
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minY = Math.min(minY, b.minY);
    maxY = Math.max(maxY, b.maxY);
  };

  for (const pts of [scene.surround, scene.floor, scene.leftWall, scene.rightWall, scene.backWall.glass, scene.backWall.mesh, ...lines]) {
    merge(collectBounds(pts));
  }
  minY = Math.min(minY, scene.backWall.crestLine.y1 - 6);

  minY = Math.min(minY, scene.net.floorY - 13);
  maxY = Math.max(maxY, scene.corners.bl.y + 18);

  const flat = pdServeFlatPoints({
    serverTeam: 'teamA',
    courtSide: 'rightDeuce',
    courtEndsSwapped: false,
    matchDoubles: true,
  });
  const serveStart = pdProjectFlat(flat.start.x, flat.start.y);
  const serveEnd = pdProjectFlat(flat.end.x, flat.end.y);
  const serveControl = serveArcControlPerpendicular(serveStart, serveEnd, {
    minBulge: PD_SERVE_ARC_MIN_BULGE,
    bulgeFactor: PD_SERVE_ARC_BULGE_FACTOR,
  });
  for (const p of [serveStart, serveControl, serveEnd]) {
    minX = Math.min(minX, p.x - 2);
    maxX = Math.max(maxX, p.x + 2);
    minY = Math.min(minY, p.y - 2);
    maxY = Math.max(maxY, p.y + 2);
  }

  const { x: sx, y: sy, w: sw, h: sh } = PADEL_SURFACE;
  for (const fx of [PD_X_L, PD_X_R, PD_CENTER_X, sx, sx + sw]) {
    for (const fy of [PD_PLAYER_TOP_Y, PD_PLAYER_BOTTOM_Y, sy, sy + sh * 0.5, sy + sh]) {
      const p = pdProjectFlat(fx, fy);
      minX = Math.min(minX, p.x - 5);
      maxX = Math.max(maxX, p.x + 5);
      minY = Math.min(minY, p.y - 5);
      maxY = Math.max(maxY, p.y + 5);
    }
  }

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

const _pdSceneViewBox = computePdSceneViewBox();
export const PD_SCENE_MIN_X = _pdSceneViewBox.minX;
export const PD_SCENE_MIN_Y = _pdSceneViewBox.minY;
export const PD_SCENE_VB_W = _pdSceneViewBox.w;
export const PD_SCENE_VB_H = _pdSceneViewBox.h;
export const PD_SCENE_VIEW_BOX = `${PD_SCENE_MIN_X} ${PD_SCENE_MIN_Y} ${PD_SCENE_VB_W} ${PD_SCENE_VB_H}`;

export function pdScenePctFromPt(p: Pt) {
  return {
    leftPct: ((p.x - PD_SCENE_MIN_X) / PD_SCENE_VB_W) * 100,
    topPct: ((p.y - PD_SCENE_MIN_Y) / PD_SCENE_VB_H) * 100,
  };
}

export type PdSceneServeTrace = {
  start: Pt;
  control: Pt;
  end: Pt;
  arrowD: string;
  ballLeftPct: number;
  ballTopPct: number;
};

function pdArcControl(start: Pt, end: Pt, _flatControl: Pt): Pt {
  return serveArcControlPerpendicular(start, end, {
    minBulge: PD_SERVE_ARC_MIN_BULGE,
    bulgeFactor: PD_SERVE_ARC_BULGE_FACTOR,
  });
}

/** Near POV baseline — keep ball on server avatar X; nudge Y toward net (squash-style). */
export function pdSceneBallNearPovFromServer(
  serverPx: number,
  serverPy: number,
  avatarScale: number,
  flatProjected: Pt
): Pt {
  const netPt = pdProjectFlat(PD_CENTER_X, PADEL_NET_Y);
  const dy = netPt.y - serverPy;
  const len = Math.abs(dy);
  const gap = 16 + 10 * avatarScale;
  const towardNet =
    len < 1e-3
      ? serverPy - gap
      : serverPy + (dy / len) * gap;
  const flatTowardNet =
    (dy < 0 && flatProjected.y < serverPy) || (dy > 0 && flatProjected.y > serverPy);
  const ballY =
    flatTowardNet && Math.abs(flatProjected.y - serverPy) >= 10
      ? flatProjected.y
      : towardNet;
  return { x: serverPx, y: ballY };
}

export function pdSceneServeBallPt(
  flatStart: { x: number; y: number },
  serverEnd: 'top' | 'bottom',
  serverScene: { px: number; py: number; avatarScale: number }
): Pt {
  const flatBall = pdProjectFlat(flatStart.x, flatStart.y);
  if (serverEnd === 'bottom') {
    return pdSceneBallNearPovFromServer(serverScene.px, serverScene.py, serverScene.avatarScale, flatBall);
  }
  return flatBall;
}

export function pdSceneServeGuideArtifacts(
  opts: Parameters<typeof pdServeFlatPoints>[0],
  serverScene: { px: number; py: number; avatarScale: number }
): {
  ball: Pt;
  flatControl: Pt;
  flatEnd: Pt;
  ballLeftPct: number;
  ballTopPct: number;
} {
  const flat = pdServeFlatPoints(opts);
  const serverEnd = pdServerEnd(opts.serverTeam, opts.courtEndsSwapped);
  const ballPt = pdSceneServeBallPt(flat.start, serverEnd, serverScene);
  const ball = pdScenePctFromPt(ballPt);
  return {
    ball: ballPt,
    flatControl: pdProjectFlat(flat.control.x, flat.control.y),
    flatEnd: pdProjectFlat(flat.end.x, flat.end.y),
    ballLeftPct: ball.leftPct,
    ballTopPct: ball.topPct,
  };
}

export function pdSceneServeOverlay(
  opts: Parameters<typeof pdServeFlatPoints>[0],
  endpoints?: { from: Pt; to: Pt }
): PdSceneServeTrace {
  const flat = pdServeFlatPoints(opts);
  const start = endpoints?.from ?? pdProjectFlat(flat.start.x, flat.start.y);
  const end = endpoints?.to ?? pdProjectFlat(flat.end.x, flat.end.y);
  const control = pdArcControl(start, end, flat.control);
  const ball = pdScenePctFromPt(start);

  return {
    start,
    control,
    end,
    arrowD: serveArcQuadraticD(start, control, end),
    ballLeftPct: ball.leftPct,
    ballTopPct: ball.topPct,
  };
}

export const pdQuadPoint = serveArcQuadPoint;

export const pdArcPathPartial = serveArcPathPartial;

export function pdSceneServiceBox(serverEnd: 'top' | 'bottom', westServe: boolean): string {
  const { end, side } = pdActiveServiceBoxSide(serverEnd, westServe);
  return pdProjectRect(pdServiceBoxRect(end, side));
}
