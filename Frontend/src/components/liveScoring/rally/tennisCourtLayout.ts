/**
 * ITF tennis court — vertical portrait, camera above near baseline looking down-court.
 * Flat geometry in tennisCourtGeometry; tnProjectFlat maps to perspective.
 */
import { serveCourtDepthAvatarScaleFromFlatY } from '../serveCourtDepthAvatarScale';
import { serveArcControlApex, serveArcPathPartial, serveArcQuadPoint } from './serveArcGeometry';
import {
  TN_CENTER_X,
  TN_COURT_L,
  TN_COURT_W_D,
  TN_NET_Y,
  TN_PLAYER_BOTTOM_Y,
  TN_PLAYER_TOP_Y,
  TN_SERVE_ARC_MIN_RISE,
  TN_SERVE_ARC_RISE_FACTOR,
  TN_SERVICE_BOTTOM,
  TN_SERVICE_TOP,
  TN_SINGLES_LEFT,
  TN_SINGLES_RIGHT,
  TN_SURFACE,
  tnServeFlatTrace,
  tnServeTargetSide,
  tnServiceBoxRect,
} from './tennisCourtGeometry';

export const TN_SURROUND_M = 1.2;

export const TN_SCENE_CX = 54;

const CX = TN_SCENE_CX;
const TOP_FLOOR_Y = 26;
const BOTTOM_FLOOR_Y = 200;
const TOP_HW = 32;
const BOTTOM_HW = 42;
const CURB_H = 4.5;

type Pt = { x: number; y: number };

function flatToCourt(fx: number, fy: number): Pt {
  const { x: sx, y: sy, w: sw, h: sh } = TN_SURFACE;
  return {
    x: ((fx - sx) / sw) * TN_COURT_W_D,
    y: ((fy - sy) / sh) * TN_COURT_L,
  };
}

function depthT(cy: number) {
  return cy / TN_COURT_L;
}

function halfWidthAt(cy: number) {
  return TOP_HW + depthT(cy) * (BOTTOM_HW - TOP_HW);
}

export function tnProjectCourt(cx: number, cy: number): Pt {
  const t = depthT(cy);
  return {
    x: CX + (cx / TN_COURT_W_D - 0.5) * 2 * halfWidthAt(cy),
    y: TOP_FLOOR_Y + t * (BOTTOM_FLOOR_Y - TOP_FLOOR_Y),
  };
}

export function tnProjectFlat(fx: number, fy: number): Pt {
  const c = flatToCourt(fx, fy);
  return tnProjectCourt(c.x, c.y);
}

export function tnAvatarScaleFromFlatY(flatY: number): number {
  const { y: sy, h: sh } = TN_SURFACE;
  return serveCourtDepthAvatarScaleFromFlatY(flatY, sy, sh, TOP_HW, BOTTOM_HW);
}

export function tnProjectPoly(flatCorners: Pt[]): string {
  return flatCorners
    .map((c) => {
      const p = tnProjectFlat(c.x, c.y);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

export function tnProjectRect(r: { x: number; y: number; w: number; h: number }): string {
  return tnProjectPoly([
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]);
}

function surroundRect(): { x: number; y: number; w: number; h: number } {
  const { x: sx, y: sy, w: sw, h: sh } = TN_SURFACE;
  const padX = (TN_SURROUND_M / TN_COURT_W_D) * sw;
  const padY = (TN_SURROUND_M / TN_COURT_L) * sh;
  return { x: sx - padX, y: sy - padY, w: sw + padX * 2, h: sh + padY * 2 };
}

function curbQuad(side: 'left' | 'right'): string {
  const s = TN_SURFACE;
  const x0 = side === 'left' ? s.x : s.x + s.w;
  const x1 = side === 'left' ? s.x - 2.5 : s.x + s.w + 2.5;
  const top = tnProjectFlat(x0, s.y);
  const bottom = tnProjectFlat(x0, s.y + s.h);
  const topOut = tnProjectFlat(x1, s.y);
  const bottomOut = tnProjectFlat(x1, s.y + s.h);
  const topLip = { x: top.x, y: top.y - CURB_H * 0.55 };
  const bottomLip = { x: bottom.x, y: bottom.y - CURB_H * 0.35 };
  const topOutLip = { x: topOut.x, y: topOut.y - CURB_H };
  const bottomOutLip = { x: bottomOut.x, y: bottomOut.y - CURB_H * 0.75 };
  return [top, bottom, bottomOut, topOut, topOutLip, bottomOutLip, bottomLip, topLip]
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

export const TN_NET_CORD_HEIGHT_M = 0.914;
export const TN_NET_POST_HEIGHT_M = 1.07;

export type TnNetLayout = {
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

export function tnScreenPxPerMeterAtNet(): number {
  const atNet = tnProjectFlat(TN_CENTER_X, TN_NET_Y);
  const oneMeterNear = tnProjectFlat(TN_CENTER_X, TN_NET_Y + 18);
  return Math.abs(oneMeterNear.y - atNet.y);
}

export function tnNetScreenDimensions(span: number): Pick<TnNetLayout, 'meshH' | 'postH' | 'tapeH' | 'postW' | 'meshBottomOffset'> {
  const pxPerM = tnScreenPxPerMeterAtNet();
  const postH = TN_NET_POST_HEIGHT_M * pxPerM;
  const meshH = TN_NET_CORD_HEIGHT_M * pxPerM;
  const meshBottomOffset = 0.05 * pxPerM;
  const tapeH = Math.max(1.1, meshH * 0.08);
  const postW = Math.max(2, span * 0.02);
  return { meshH, postH, tapeH, postW, meshBottomOffset };
}

export function tnNetLayout(): TnNetLayout {
  const s = TN_SURFACE;
  const left = tnProjectFlat(s.x, TN_NET_Y);
  const right = tnProjectFlat(s.x + s.w, TN_NET_Y);
  const span = right.x - left.x;
  return {
    left,
    right,
    floorY: left.y,
    span,
    centerX: (left.x + right.x) / 2,
    ...tnNetScreenDimensions(span),
  };
}

export function tnLinePaths(matchDoubles: boolean): string[] {
  const s = TN_SURFACE;
  const { x: sx, y: sy, w: sw, h: sh } = s;

  const outline = tnProjectPoly([
    { x: sx, y: sy },
    { x: sx + sw, y: sy },
    { x: sx + sw, y: sy + sh },
    { x: sx, y: sy + sh },
    { x: sx, y: sy },
  ]);

  const hLine = (y: number, x1: number, x2: number) =>
    tnProjectPoly([
      { x: x1, y },
      { x: x2, y },
    ]);

  const vLine = (x: number, y1: number, y2: number) =>
    tnProjectPoly([
      { x, y: y1 },
      { x, y: y2 },
    ]);

  const lines: string[] = [
    outline,
    hLine(TN_SERVICE_TOP, sx, sx + sw),
    hLine(TN_SERVICE_BOTTOM, sx, sx + sw),
    vLine(TN_CENTER_X, TN_SERVICE_TOP, TN_NET_Y),
    vLine(TN_CENTER_X, TN_NET_Y, TN_SERVICE_BOTTOM),
  ];

  if (!matchDoubles) {
    lines.push(
      vLine(TN_SINGLES_LEFT, sy, sy + sh),
      vLine(TN_SINGLES_RIGHT, sy, sy + sh)
    );
  }

  return lines;
}

export function tnSceneGeometry() {
  const s = TN_SURFACE;
  const surround = surroundRect();
  const tl = tnProjectFlat(s.x, s.y);
  const tr = tnProjectFlat(s.x + s.w, s.y);
  const bl = tnProjectFlat(s.x, s.y + s.h);
  const br = tnProjectFlat(s.x + s.w, s.y + s.h);

  return {
    surround: tnProjectRect(surround),
    floor: tnProjectRect(s),
    leftCurb: curbQuad('left'),
    rightCurb: curbQuad('right'),
    corners: { tl, tr, bl, br },
    net: tnNetLayout(),
  };
}

function computeTnSceneViewBox(matchDoubles: boolean): { minX: number; minY: number; w: number; h: number } {
  const scene = tnSceneGeometry();
  const lines = tnLinePaths(matchDoubles);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const collect = (pts: string) => {
    for (const p of pts.split(' ')) {
      const [x, y] = p.split(',').map(Number);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  };

  for (const pts of [scene.surround, scene.floor, scene.leftCurb, scene.rightCurb, ...lines]) {
    collect(pts);
  }

  minY = Math.min(minY, scene.net.floorY - scene.net.postH - 3);
  maxY = Math.max(maxY, scene.corners.bl.y + 12);

  for (const fy of [TN_PLAYER_TOP_Y, TN_PLAYER_BOTTOM_Y]) {
    const p = tnProjectFlat(TN_CENTER_X, fy);
    minY = Math.min(minY, p.y - 4);
    maxY = Math.max(maxY, p.y + 4);
  }

  const flat = tnServeFlatTrace({
    serverTeam: 'teamA',
    courtEndsSwapped: false,
    serveRight: true,
    matchDoubles: false,
    serverPlayerIndex: 0,
  });
  const serveStart = tnProjectFlat(flat.start.x, flat.start.y);
  const serveEnd = tnProjectFlat(flat.end.x, flat.end.y);
  const serveControl = serveArcControlApex(serveStart, serveEnd, {
    minRise: TN_SERVE_ARC_MIN_RISE,
    riseFactor: TN_SERVE_ARC_RISE_FACTOR,
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
  return {
    minX: Math.floor(minX - padX),
    minY: Math.floor(minY - padTop),
    w: Math.ceil(maxX + padX) - Math.floor(minX - padX),
    h: Math.ceil(maxY + padBottom) - Math.floor(minY - padTop),
  };
}

const _tnSceneSingles = computeTnSceneViewBox(false);
export const TN_SCENE_MIN_X = _tnSceneSingles.minX;
export const TN_SCENE_MIN_Y = _tnSceneSingles.minY;
export const TN_SCENE_VB_W = _tnSceneSingles.w;
export const TN_SCENE_VB_H = _tnSceneSingles.h;
export const TN_SCENE_VIEW_BOX = `${TN_SCENE_MIN_X} ${TN_SCENE_MIN_Y} ${TN_SCENE_VB_W} ${TN_SCENE_VB_H}`;

export function tnScenePctFromPt(p: Pt) {
  return {
    leftPct: ((p.x - TN_SCENE_MIN_X) / TN_SCENE_VB_W) * 100,
    topPct: ((p.y - TN_SCENE_MIN_Y) / TN_SCENE_VB_H) * 100,
  };
}

export function tnSceneServeArcControl(from: Pt, to: Pt): Pt {
  return serveArcControlApex(from, to, {
    minRise: TN_SERVE_ARC_MIN_RISE,
    riseFactor: TN_SERVE_ARC_RISE_FACTOR,
  });
}

export function tnSceneServeGuideArtifacts(opts: Parameters<typeof tnServeFlatTrace>[0]): {
  ball: Pt;
  flatControl: Pt;
  ballLeftPct: number;
  ballTopPct: number;
} {
  const flat = tnServeFlatTrace(opts);
  const flatControl = tnProjectFlat(flat.control.x, flat.control.y);
  const ballPt = tnProjectFlat(flat.start.x, flat.start.y);
  const ball = tnScenePctFromPt(ballPt);
  return { ball: ballPt, flatControl, ballLeftPct: ball.leftPct, ballTopPct: ball.topPct };
}

export function tnSceneServiceBox(
  serverEnd: 'top' | 'bottom',
  serveRight: boolean,
  matchDoubles: boolean
): string {
  const recv = serverEnd === 'top' ? 'bottom' : 'top';
  const side = tnServeTargetSide(serverEnd, serveRight);
  return tnProjectRect(tnServiceBoxRect(recv, side, matchDoubles));
}

export { tnServerEnd } from './tennisCourtGeometry';
export const tnArcPathPartial = serveArcPathPartial;
export const tnQuadPoint = serveArcQuadPoint;
