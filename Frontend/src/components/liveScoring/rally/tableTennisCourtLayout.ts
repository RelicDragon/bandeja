/**
 * ITTF table — vertical portrait, camera above near end looking down the table.
 * Flat geometry in tableTennisCourtGeometry; ttProjectFlat maps to perspective.
 */
import { serveCourtDepthAvatarScaleFromFlatY } from '../serveCourtDepthAvatarScale';
import {
  TT_CENTER_X,
  TT_FLAT_UNITS_PER_M,
  TT_FRAME,
  TT_NET_Y,
  TT_PLAYER_BOTTOM_Y,
  TT_PLAYER_TOP_Y,
  TT_SURFACE,
  TT_TABLE_L_M,
  TT_TABLE_W_M,
  ttServeFlatTrace,
  ttServiceQuadrantRect,
} from './tableTennisCourtGeometry';

export { TT_TABLE_L_M, TT_TABLE_W_M };

/** ITTF — top of net 15.25 cm above playing surface; ~15 mm white tape band at top. */
export const TT_NET_TOP_M = 0.1525;
export const TT_NET_TAPE_M = 0.015;
export const TT_NET_MESH_M = TT_NET_TOP_M - TT_NET_TAPE_M;

export const TT_SCENE_CX = 52;

const CX = TT_SCENE_CX;
const TOP_FLOOR_Y = 48;
const BOTTOM_FLOOR_Y = 168;
/** Wider trapezoid — ITTF table is relatively wide (1.525 × 2.74 m); was too narrow vs other sports. */
const TOP_HW = 27;
const BOTTOM_HW = 50;
type Pt = { x: number; y: number };

function flatToCourt(fx: number, fy: number): Pt {
  const { x: sx, y: sy, w: sw, h: sh } = TT_SURFACE;
  return {
    x: ((fx - sx) / sw) * TT_TABLE_W_M,
    y: ((fy - sy) / sh) * TT_TABLE_L_M,
  };
}

function depthT(cy: number) {
  return cy / TT_TABLE_L_M;
}

function halfWidthAt(cy: number) {
  return TOP_HW + depthT(cy) * (BOTTOM_HW - TOP_HW);
}

export function ttProjectCourt(cx: number, cy: number): Pt {
  const t = depthT(cy);
  return {
    x: CX + (cx / TT_TABLE_W_M - 0.5) * 2 * halfWidthAt(cy),
    y: TOP_FLOOR_Y + t * (BOTTOM_FLOOR_Y - TOP_FLOOR_Y),
  };
}

export function ttProjectFlat(fx: number, fy: number): Pt {
  const c = flatToCourt(fx, fy);
  return ttProjectCourt(c.x, c.y);
}

export function ttAvatarScaleFromFlatY(flatY: number): number {
  const { y: sy, h: sh } = TT_SURFACE;
  return serveCourtDepthAvatarScaleFromFlatY(flatY, sy, sh, TOP_HW, BOTTOM_HW);
}

export function ttProjectPoly(flatCorners: Pt[]): string {
  return flatCorners
    .map((c) => {
      const p = ttProjectFlat(c.x, c.y);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

export function ttProjectRect(r: { x: number; y: number; w: number; h: number }): string {
  return ttProjectPoly([
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]);
}

/** Side apron — surface edge to frame edge (4 corners only; screen-space lips spike at far end). */
function apronQuad(side: 'left' | 'right'): string {
  const s = TT_SURFACE;
  const f = TT_FRAME;
  const x0 = side === 'left' ? s.x : s.x + s.w;
  const x1 = side === 'left' ? f.x : f.x + f.w;
  const top = ttProjectFlat(x0, s.y);
  const bottom = ttProjectFlat(x0, s.y + s.h);
  const topOut = ttProjectFlat(x1, f.y);
  const bottomOut = ttProjectFlat(x1, f.y + f.h);
  return [top, bottom, bottomOut, topOut].map((p) => `${p.x},${p.y}`).join(' ');
}

export type TtNetLayout = {
  left: Pt;
  right: Pt;
  floorY: number;
  span: number;
  centerX: number;
  meshH: number;
  postH: number;
  tapeH: number;
  postW: number;
};

export function ttScreenPxPerMeterAtNet(): number {
  const atNet = ttProjectFlat(TT_CENTER_X, TT_NET_Y);
  const oneMeterNear = ttProjectFlat(TT_CENTER_X, TT_NET_Y + TT_FLAT_UNITS_PER_M);
  return Math.abs(oneMeterNear.y - atNet.y);
}

export function ttNetScreenDimensions(span: number): Pick<TtNetLayout, 'meshH' | 'postH' | 'tapeH' | 'postW'> {
  const pxPerM = ttScreenPxPerMeterAtNet();
  const postH = TT_NET_TOP_M * pxPerM;
  const tapeH = TT_NET_TAPE_M * pxPerM;
  const meshH = TT_NET_MESH_M * pxPerM;
  const postW = Math.max(1.8, span * 0.022);
  return { meshH, postH, tapeH, postW };
}

export function ttNetLayout(): TtNetLayout {
  const s = TT_SURFACE;
  const left = ttProjectFlat(s.x, TT_NET_Y);
  const right = ttProjectFlat(s.x + s.w, TT_NET_Y);
  const span = right.x - left.x;
  return {
    left,
    right,
    floorY: left.y,
    span,
    centerX: (left.x + right.x) / 2,
    ...ttNetScreenDimensions(span),
  };
}

export function ttLinePaths(matchDoubles: boolean): string[] {
  const s = TT_SURFACE;
  const { x: sx, y: sy, w: sw, h: sh } = s;
  const inset = 1.2;

  const outline = ttProjectPoly([
    { x: sx + inset, y: sy + inset },
    { x: sx + sw - inset, y: sy + inset },
    { x: sx + sw - inset, y: sy + sh - inset },
    { x: sx + inset, y: sy + sh - inset },
    { x: sx + inset, y: sy + inset },
  ]);

  const vLine = (y1: number, y2: number) =>
    ttProjectPoly([
      { x: TT_CENTER_X, y: y1 },
      { x: TT_CENTER_X, y: y2 },
    ]);

  const lines = [outline];
  if (matchDoubles) {
    lines.push(vLine(sy + inset, sy + sh - inset));
  } else {
    lines.push(vLine(sy + inset, TT_NET_Y - 2));
    lines.push(vLine(TT_NET_Y + 2, sy + sh - inset));
  }
  return lines;
}

export function ttSceneGeometry() {
  const s = TT_SURFACE;
  const f = TT_FRAME;
  const tl = ttProjectFlat(s.x, s.y);
  const tr = ttProjectFlat(s.x + s.w, s.y);
  const bl = ttProjectFlat(s.x, s.y + s.h);
  const br = ttProjectFlat(s.x + s.w, s.y + s.h);
  const framePoly = ttProjectRect(f);

  const legInset = 0.1;
  const legs = [legInset, 1 - legInset].map((fx) => {
    const lx = f.x + f.w * fx;
    const top = ttProjectFlat(lx, f.y + f.h);
    return { x: top.x - 4, y: top.y, w: 8, h: 12 };
  });

  return {
    frame: framePoly,
    floor: ttProjectRect(s),
    leftApron: apronQuad('left'),
    rightApron: apronQuad('right'),
    corners: { tl, tr, bl, br },
    net: ttNetLayout(),
    legs,
    shadow: {
      cx: (bl.x + br.x) / 2,
      cy: bl.y + 8,
      rx: (br.x - bl.x) * 0.4,
      ry: 4,
    },
  };
}

function computeTtSceneViewBox(): { minX: number; minY: number; w: number; h: number } {
  const scene = ttSceneGeometry();
  const lines = ttLinePaths(false);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pts of [scene.frame, scene.floor, scene.leftApron, scene.rightApron, ...lines]) {
    for (const p of pts.split(' ')) {
      const [x, y] = p.split(',').map(Number);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  for (const leg of scene.legs) {
    minX = Math.min(minX, leg.x);
    maxX = Math.max(maxX, leg.x + leg.w);
    maxY = Math.max(maxY, leg.y + leg.h);
  }

  maxY = Math.max(maxY, scene.corners.bl.y + scene.legs[0].h + 4);

  for (const fy of [TT_PLAYER_TOP_Y, TT_PLAYER_BOTTOM_Y]) {
    const p = ttProjectFlat(TT_CENTER_X, fy);
    minY = Math.min(minY, p.y - 6);
    maxY = Math.max(maxY, p.y + 6);
  }

  const flat = ttServeFlatTrace({
    serverTeam: 'teamA',
    courtEndsSwapped: false,
    serveRight: true,
    matchDoubles: false,
    serverPlayerIndex: 0,
  });
  const serveStart = ttProjectFlat(flat.start.x, flat.start.y);
  const serveEnd = ttProjectFlat(flat.end.x, flat.end.y);
  const serveControlFlat = ttProjectFlat(flat.control.x, flat.control.y);
  const serveLift = Math.max(8, Math.abs(serveStart.y - serveEnd.y) * 0.32);
  const serveControl = { x: serveControlFlat.x, y: serveControlFlat.y - serveLift };
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

/** Floor + frame bounds for serve-coach sizing (wider than full scene viewBox). */
export function ttServeGuideFrameAspect(): readonly [number, number] {
  const scene = ttSceneGeometry();
  const s = TT_SURFACE;
  const pts = [
    ttProjectFlat(s.x, s.y),
    ttProjectFlat(s.x + s.w, s.y),
    ttProjectFlat(s.x, s.y + s.h),
    ttProjectFlat(s.x + s.w, s.y + s.h),
  ];
  for (const p of scene.frame.split(' ')) {
    const [x, y] = p.split(',').map(Number);
    pts.push({ x, y });
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const padX = 3;
  const padY = 4;
  return [maxX - minX + padX * 2, maxY - minY + padY * 2];
}

const _ttSceneViewBox = computeTtSceneViewBox();
export const TT_SCENE_MIN_X = _ttSceneViewBox.minX;
export const TT_SCENE_MIN_Y = _ttSceneViewBox.minY;
export const TT_SCENE_VB_W = _ttSceneViewBox.w;
export const TT_SCENE_VB_H = _ttSceneViewBox.h;
export const TT_SCENE_VIEW_BOX = `${TT_SCENE_MIN_X} ${TT_SCENE_MIN_Y} ${TT_SCENE_VB_W} ${TT_SCENE_VB_H}`;

export function ttScenePctFromPt(p: Pt) {
  return {
    leftPct: ((p.x - TT_SCENE_MIN_X) / TT_SCENE_VB_W) * 100,
    topPct: ((p.y - TT_SCENE_MIN_Y) / TT_SCENE_VB_H) * 100,
  };
}

export type TtSceneServeTrace = {
  start: Pt;
  control: Pt;
  end: Pt;
  arrowD: string;
  ballLeftPct: number;
  ballTopPct: number;
};

function ttArcControl(start: Pt, end: Pt, flatControl: Pt): Pt {
  const projected = ttProjectFlat(flatControl.x, flatControl.y);
  const lift = Math.max(8, Math.abs(start.y - end.y) * 0.32);
  return { x: projected.x, y: projected.y - lift };
}

export function ttSceneServeGuideArtifacts(opts: Parameters<typeof ttServeFlatTrace>[0]): {
  ball: Pt;
  flatControl: Pt;
  ballLeftPct: number;
  ballTopPct: number;
} {
  const flat = ttServeFlatTrace(opts);
  const flatControl = ttProjectFlat(flat.control.x, flat.control.y);
  const ballPt = ttProjectFlat(flat.start.x, flat.start.y);
  const ball = ttScenePctFromPt(ballPt);
  return { ball: ballPt, flatControl, ballLeftPct: ball.leftPct, ballTopPct: ball.topPct };
}

export function ttSceneServeOverlay(
  opts: Parameters<typeof ttServeFlatTrace>[0],
  endpoints?: { from: Pt; to: Pt }
): TtSceneServeTrace {
  const flat = ttServeFlatTrace(opts);
  const start = endpoints?.from ?? ttProjectFlat(flat.start.x, flat.start.y);
  const end = endpoints?.to ?? ttProjectFlat(flat.end.x, flat.end.y);
  const control = ttArcControl(start, end, flat.control);
  const ball = ttScenePctFromPt(start);

  return {
    start,
    control,
    end,
    arrowD: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    ballLeftPct: ball.leftPct,
    ballTopPct: ball.topPct,
  };
}

export function ttSceneServiceQuadrant(end: 'top' | 'bottom', side: 'left' | 'right'): string {
  return ttProjectRect(ttServiceQuadrantRect(end, side));
}

export function ttQuadPoint(start: Pt, control: Pt, end: Pt, t: number): Pt {
  const u = Math.max(0, Math.min(1, t));
  const o = 1 - u;
  return {
    x: o * o * start.x + 2 * o * u * control.x + u * u * end.x,
    y: o * o * start.y + 2 * o * u * control.y + u * u * end.y,
  };
}

const ARC_SAMPLES = 28;

export function ttArcPathPartial(start: Pt, control: Pt, end: Pt, t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const steps = Math.max(1, Math.ceil(u * ARC_SAMPLES));
  let d = `M ${start.x} ${start.y}`;
  for (let i = 1; i <= steps; i++) {
    const pt = ttQuadPoint(start, control, end, i / ARC_SAMPLES);
    d += ` L ${pt.x} ${pt.y}`;
  }
  return d;
}
