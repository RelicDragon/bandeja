/**
 * BWF court — vertical portrait, camera above near baseline looking down-court.
 * Flat viewBox geometry lives in badmintonCourtGeometry; bdProjectFlat maps to perspective.
 */
import { serveCourtDepthAvatarScaleFromFlatY } from '../serveCourtDepthAvatarScale';
import { serveArcControlApex, serveArcPathPartial, serveArcQuadPoint } from './serveArcGeometry';
import {
  BD_CENTER_X,
  BD_CENTRE_LINE_BOTTOM_START,
  BD_CENTRE_LINE_TOP_END,
  BD_DOUBLES_LONG_BOTTOM,
  BD_DOUBLES_LONG_TOP,
  BD_NET_Y,
  BD_SHORT_SERVICE_BOTTOM,
  BD_SHORT_SERVICE_TOP,
  BD_SINGLES_LEFT,
  BD_SINGLES_RIGHT,
  BD_SURFACE,
  bdBackServiceBoxRect,
  bdServeFlatTrace,
  BD_PLAYER_BOTTOM_Y,
  BD_PLAYER_TOP_Y,
  BD_SERVE_ARC_MIN_RISE,
  BD_SERVE_ARC_RISE_FACTOR,
} from './badmintonCourtGeometry';

export const BD_COURT_W_M = 6.1;
export const BD_COURT_L_M = 13.4;
export const BD_SURROUND_M = 0.55;

export const BD_SCENE_CX = 52;

const CX = BD_SCENE_CX;
const TOP_FLOOR_Y = 28;
const BOTTOM_FLOOR_Y = 198;
const TOP_HW = 30;
const BOTTOM_HW = 40;
const CURB_H = 4.5;

type Pt = { x: number; y: number };

function flatToCourt(fx: number, fy: number): Pt {
  const { x: sx, y: sy, w: sw, h: sh } = BD_SURFACE;
  return {
    x: ((fx - sx) / sw) * BD_COURT_W_M,
    y: ((fy - sy) / sh) * BD_COURT_L_M,
  };
}

function depthT(cy: number) {
  return cy / BD_COURT_L_M;
}

function halfWidthAt(cy: number) {
  return TOP_HW + depthT(cy) * (BOTTOM_HW - TOP_HW);
}

export function bdProjectCourt(cx: number, cy: number): Pt {
  const t = depthT(cy);
  return {
    x: CX + (cx / BD_COURT_W_M - 0.5) * 2 * halfWidthAt(cy),
    y: TOP_FLOOR_Y + t * (BOTTOM_FLOOR_Y - TOP_FLOOR_Y),
  };
}

export function bdProjectFlat(fx: number, fy: number): Pt {
  const c = flatToCourt(fx, fy);
  return bdProjectCourt(c.x, c.y);
}

export function bdAvatarScaleFromFlatY(flatY: number): number {
  const { y: sy, h: sh } = BD_SURFACE;
  return serveCourtDepthAvatarScaleFromFlatY(flatY, sy, sh, TOP_HW, BOTTOM_HW);
}

export function bdProjectPoly(flatCorners: Pt[]): string {
  return flatCorners
    .map((c) => {
      const p = bdProjectFlat(c.x, c.y);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

export function bdProjectRect(r: { x: number; y: number; w: number; h: number }): string {
  return bdProjectPoly([
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]);
}

function surroundRect(): { x: number; y: number; w: number; h: number } {
  const { x: sx, y: sy, w: sw, h: sh } = BD_SURFACE;
  const padX = (BD_SURROUND_M / BD_COURT_W_M) * sw;
  const padY = (BD_SURROUND_M / BD_COURT_L_M) * sh;
  return { x: sx - padX, y: sy - padY, w: sw + padX * 2, h: sh + padY * 2 };
}

function curbQuad(side: 'left' | 'right'): string {
  const s = BD_SURFACE;
  const x0 = side === 'left' ? s.x : s.x + s.w;
  const x1 = side === 'left' ? s.x - 2.5 : s.x + s.w + 2.5;
  const top = bdProjectFlat(x0, s.y);
  const bottom = bdProjectFlat(x0, s.y + s.h);
  const topOut = bdProjectFlat(x1, s.y);
  const bottomOut = bdProjectFlat(x1, s.y + s.h);
  const topLip = { x: top.x, y: top.y - CURB_H * 0.55 };
  const bottomLip = { x: bottom.x, y: bottom.y - CURB_H * 0.35 };
  const topOutLip = { x: topOut.x, y: topOut.y - CURB_H };
  const bottomOutLip = { x: bottomOut.x, y: bottomOut.y - CURB_H * 0.75 };
  return [top, bottom, bottomOut, topOut, topOutLip, bottomOutLip, bottomLip, topLip]
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

export const BD_NET_BOTTOM_CLEARANCE_M = 0.76;
export const BD_NET_POST_HEIGHT_M = 1.55;
export const BD_NET_MESH_HEIGHT_M = BD_NET_POST_HEIGHT_M - BD_NET_BOTTOM_CLEARANCE_M;

export type BdNetLayout = {
  left: Pt;
  right: Pt;
  floorY: number;
  span: number;
  centerX: number;
  meshH: number;
  postH: number;
  tapeH: number;
  postW: number;
  meshBottomOffset: number;
};

/** Screen pixels per metre of court depth at the net (toward near baseline). */
export function bdScreenPxPerMeterAtNet(): number {
  const atNet = bdProjectFlat(BD_CENTER_X, BD_NET_Y);
  const oneMeterNear = bdProjectFlat(BD_CENTER_X, BD_NET_Y + 20);
  return Math.abs(oneMeterNear.y - atNet.y);
}

export function bdNetScreenDimensions(span: number): Pick<BdNetLayout, 'meshH' | 'postH' | 'tapeH' | 'postW' | 'meshBottomOffset'> {
  const pxPerM = bdScreenPxPerMeterAtNet();
  const postH = BD_NET_POST_HEIGHT_M * pxPerM;
  const meshH = BD_NET_MESH_HEIGHT_M * pxPerM;
  const meshBottomOffset = BD_NET_BOTTOM_CLEARANCE_M * pxPerM;
  const tapeH = Math.max(1.1, meshH * 0.07);
  const postW = Math.max(2, span * 0.022);
  return { meshH, postH, tapeH, postW, meshBottomOffset };
}

export function bdNetLayout(): BdNetLayout {
  const s = BD_SURFACE;
  const left = bdProjectFlat(s.x, BD_NET_Y);
  const right = bdProjectFlat(s.x + s.w, BD_NET_Y);
  const span = right.x - left.x;
  return {
    left,
    right,
    floorY: left.y,
    span,
    centerX: (left.x + right.x) / 2,
    ...bdNetScreenDimensions(span),
  };
}

export function bdLinePaths(): string[] {
  const s = BD_SURFACE;
  const { x: sx, y: sy, w: sw, h: sh } = s;
  const half = 0.675;

  const outline = bdProjectPoly([
    { x: sx, y: sy },
    { x: sx + sw, y: sy },
    { x: sx + sw, y: sy + sh },
    { x: sx, y: sy + sh },
    { x: sx, y: sy },
  ]);

  const hLine = (y: number) =>
    bdProjectPoly([
      { x: sx + half, y },
      { x: sx + sw - half, y },
    ]);

  const vLine = (x: number, y1: number, y2: number) =>
    bdProjectPoly([
      { x, y: y1 },
      { x, y: y2 },
    ]);

  return [
    outline,
    hLine(BD_SHORT_SERVICE_TOP),
    hLine(BD_SHORT_SERVICE_BOTTOM),
    hLine(BD_DOUBLES_LONG_TOP),
    hLine(BD_DOUBLES_LONG_BOTTOM),
    vLine(BD_SINGLES_LEFT, sy + half, sy + sh - half),
    vLine(BD_SINGLES_RIGHT, sy + half, sy + sh - half),
    vLine(BD_CENTER_X, sy + half, BD_CENTRE_LINE_TOP_END),
    vLine(BD_CENTER_X, BD_CENTRE_LINE_BOTTOM_START, sy + sh - half),
  ];
}

export function bdSceneGeometry() {
  const s = BD_SURFACE;
  const surround = surroundRect();
  const tl = bdProjectFlat(s.x, s.y);
  const tr = bdProjectFlat(s.x + s.w, s.y);
  const bl = bdProjectFlat(s.x, s.y + s.h);
  const br = bdProjectFlat(s.x + s.w, s.y + s.h);

  return {
    surround: bdProjectRect(surround),
    floor: bdProjectRect(s),
    leftCurb: curbQuad('left'),
    rightCurb: curbQuad('right'),
    corners: { tl, tr, bl, br },
    net: bdNetLayout(),
  };
}

function computeBdSceneViewBox(): { minX: number; minY: number; w: number; h: number } {
  const scene = bdSceneGeometry();
  const lines = bdLinePaths();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pts of [scene.surround, scene.floor, scene.leftCurb, scene.rightCurb, ...lines]) {
    for (const p of pts.split(' ')) {
      const [x, y] = p.split(',').map(Number);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  minY = Math.min(minY, scene.net.floorY - scene.net.postH - 3);
  maxY = Math.max(maxY, scene.corners.bl.y + 12);

  for (const fy of [BD_PLAYER_TOP_Y, BD_PLAYER_BOTTOM_Y]) {
    const p = bdProjectFlat(BD_CENTER_X, fy);
    minY = Math.min(minY, p.y - 4);
    maxY = Math.max(maxY, p.y + 4);
  }

  const flat = bdServeFlatTrace({
    serverTeam: 'teamA',
    courtEndsSwapped: false,
    serveRight: true,
    matchDoubles: false,
    serverPlayerIndex: 0,
  });
  const serveStart = bdProjectFlat(flat.start.x, flat.start.y);
  const serveEnd = bdProjectFlat(flat.end.x, flat.end.y);
  const serveControl = serveArcControlApex(serveStart, serveEnd, {
    minRise: BD_SERVE_ARC_MIN_RISE,
    riseFactor: BD_SERVE_ARC_RISE_FACTOR,
  });
  for (const p of [serveStart, serveControl, serveEnd]) {
    minX = Math.min(minX, p.x - 2);
    maxX = Math.max(maxX, p.x + 2);
    minY = Math.min(minY, p.y - 2);
    maxY = Math.max(maxY, p.y + 2);
  }

  const padX = 4;
  const padTop = 4;
  const padBottom = 6;
  const minXp = Math.floor(minX - padX);
  const minYp = Math.floor(minY - padTop);
  const maxXp = Math.ceil(maxX + padX);
  const maxYp = Math.ceil(maxY + padBottom);

  return { minX: minXp, minY: minYp, w: maxXp - minXp, h: maxYp - minYp };
}

const _bdSceneViewBox = computeBdSceneViewBox();
export const BD_SCENE_MIN_X = _bdSceneViewBox.minX;
export const BD_SCENE_MIN_Y = _bdSceneViewBox.minY;
export const BD_SCENE_VB_W = _bdSceneViewBox.w;
export const BD_SCENE_VB_H = _bdSceneViewBox.h;
export const BD_SCENE_VIEW_BOX = `${BD_SCENE_MIN_X} ${BD_SCENE_MIN_Y} ${BD_SCENE_VB_W} ${BD_SCENE_VB_H}`;

export function bdScenePctFromPt(p: Pt) {
  return {
    leftPct: ((p.x - BD_SCENE_MIN_X) / BD_SCENE_VB_W) * 100,
    topPct: ((p.y - BD_SCENE_MIN_Y) / BD_SCENE_VB_H) * 100,
  };
}

export type BdSceneServeTrace = {
  start: Pt;
  control: Pt;
  end: Pt;
  arrowD: string;
  ballLeftPct: number;
  ballTopPct: number;
};

export function bdSceneServeArcControl(from: Pt, to: Pt): Pt {
  return serveArcControlApex(from, to, {
    minRise: BD_SERVE_ARC_MIN_RISE,
    riseFactor: BD_SERVE_ARC_RISE_FACTOR,
  });
}

function bdArcControl(start: Pt, end: Pt, _flatControl: Pt): Pt {
  return bdSceneServeArcControl(start, end);
}

export function bdSceneServeGuideArtifacts(opts: Parameters<typeof bdServeFlatTrace>[0]): {
  ball: Pt;
  flatControl: Pt;
  ballLeftPct: number;
  ballTopPct: number;
} {
  const flat = bdServeFlatTrace(opts);
  const flatControl = bdProjectFlat(flat.control.x, flat.control.y);
  const ballPt = bdProjectFlat(flat.start.x, flat.start.y);
  const ball = bdScenePctFromPt(ballPt);
  return { ball: ballPt, flatControl, ballLeftPct: ball.leftPct, ballTopPct: ball.topPct };
}

export function bdSceneServeOverlay(
  opts: Parameters<typeof bdServeFlatTrace>[0],
  endpoints?: { from: Pt; to: Pt }
): BdSceneServeTrace {
  const flat = bdServeFlatTrace(opts);
  const start = endpoints?.from ?? bdProjectFlat(flat.start.x, flat.start.y);
  const end = endpoints?.to ?? bdProjectFlat(flat.end.x, flat.end.y);
  const control = bdArcControl(start, end, flat.control);
  const ball = bdScenePctFromPt(start);

  return {
    start,
    control,
    end,
    arrowD: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    ballLeftPct: ball.leftPct,
    ballTopPct: ball.topPct,
  };
}

export function bdSceneServiceBox(end: 'top' | 'bottom', side: 'left' | 'right'): string {
  return bdProjectRect(bdBackServiceBoxRect(end, side));
}

export const bdQuadPoint = serveArcQuadPoint;

/** Progressive arc path for animated serve trace (mirrors pickleball). */
export const bdArcPathPartial = serveArcPathPartial;
