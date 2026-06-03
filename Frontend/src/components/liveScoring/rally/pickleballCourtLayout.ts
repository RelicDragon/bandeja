/**
 * USAPA court — vertical portrait, camera above near baseline looking down-court.
 * Flat viewBox geometry lives in pickleballCourtGeometry; pbProjectFlat maps to perspective.
 */
import {
  serveCourtDepthAvatarScaleFromFlatY,
  serveCourtDepthAvatarScaleFromScreenY,
} from '../serveCourtDepthAvatarScale';
import { serveArcControlLifted, serveArcPathPartial, serveArcQuadPoint } from './serveArcGeometry';
import {
  PB_CENTER_X,
  PB_NVZ_BOTTOM_Y,
  PB_NVZ_TOP_Y,
  PICKLEBALL_NET_Y,
  PICKLEBALL_SURFACE,
  pbBaselineYForEnd,
  pbServeFlatPoints,
  pbServiceBoxRect,
} from './pickleballCourtGeometry';

export const PB_COURT_W_FT = 20;
export const PB_COURT_L_FT = 44;
export const PB_SURROUND_FT = 2.5;

/** Fixed screen-space center for court projection (independent of viewBox width). */
export const PB_SCENE_CX = 56;

const CX = PB_SCENE_CX;
const TOP_FLOOR_Y = 30;
const BOTTOM_FLOOR_Y = 194;
const TOP_HW = 35;
const BOTTOM_HW = 54;
const CURB_H = 5;

type Pt = { x: number; y: number };

function flatToCourt(fx: number, fy: number): Pt {
  const { x: sx, y: sy, w: sw, h: sh } = PICKLEBALL_SURFACE;
  return {
    x: ((fx - sx) / sw) * PB_COURT_W_FT,
    y: ((fy - sy) / sh) * PB_COURT_L_FT,
  };
}

function depthT(cy: number) {
  return cy / PB_COURT_L_FT;
}

function halfWidthAt(cy: number) {
  return TOP_HW + depthT(cy) * (BOTTOM_HW - TOP_HW);
}

export function pbProjectCourt(cx: number, cy: number): Pt {
  const t = depthT(cy);
  return {
    x: CX + (cx / PB_COURT_W_FT - 0.5) * 2 * halfWidthAt(cy),
    y: TOP_FLOOR_Y + t * (BOTTOM_FLOOR_Y - TOP_FLOOR_Y),
  };
}

export function pbProjectFlat(fx: number, fy: number): Pt {
  const c = flatToCourt(fx, fy);
  return pbProjectCourt(c.x, c.y);
}

const _pbAvatarDepth = (() => {
  const cx = PB_CENTER_X;
  const farFlat = pbBaselineYForEnd('top');
  const nearFlat = pbBaselineYForEnd('bottom');
  return {
    farFlat,
    flatSpan: nearFlat - farFlat,
    farScreen: pbProjectFlat(cx, farFlat).y,
    nearScreen: pbProjectFlat(cx, nearFlat).y,
  };
})();

export function pbAvatarScaleFromFlatY(flatY: number): number {
  return serveCourtDepthAvatarScaleFromFlatY(
    flatY,
    _pbAvatarDepth.farFlat,
    _pbAvatarDepth.flatSpan,
    TOP_HW,
    BOTTOM_HW
  );
}

/** Perspective scale from projected screen Y (matches court widening toward POV). */
export function pbAvatarScaleFromScreenY(screenY: number): number {
  return serveCourtDepthAvatarScaleFromScreenY(
    screenY,
    _pbAvatarDepth.farScreen,
    _pbAvatarDepth.nearScreen,
    TOP_HW,
    BOTTOM_HW
  );
}

export function pbProjectPoly(flatCorners: Pt[]): string {
  return flatCorners
    .map((c) => {
      const p = pbProjectFlat(c.x, c.y);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

export function pbProjectRect(r: { x: number; y: number; w: number; h: number }): string {
  return pbProjectPoly([
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]);
}

function surroundRect(): { x: number; y: number; w: number; h: number } {
  const { x: sx, y: sy, w: sw, h: sh } = PICKLEBALL_SURFACE;
  const padX = (PB_SURROUND_FT / PB_COURT_W_FT) * sw;
  const padY = (PB_SURROUND_FT / PB_COURT_L_FT) * sh;
  return { x: sx - padX, y: sy - padY, w: sw + padX * 2, h: sh + padY * 2 };
}

function curbQuad(side: 'left' | 'right'): string {
  const s = PICKLEBALL_SURFACE;
  const x0 = side === 'left' ? s.x : s.x + s.w;
  const x1 = side === 'left' ? s.x - 3 : s.x + s.w + 3;
  const top = pbProjectFlat(x0, s.y);
  const bottom = pbProjectFlat(x0, s.y + s.h);
  const topOut = pbProjectFlat(x1, s.y);
  const bottomOut = pbProjectFlat(x1, s.y + s.h);
  const topLip = { x: top.x, y: top.y - CURB_H * 0.55 };
  const bottomLip = { x: bottom.x, y: bottom.y - CURB_H * 0.35 };
  const topOutLip = { x: topOut.x, y: topOut.y - CURB_H };
  const bottomOutLip = { x: bottomOut.x, y: bottomOut.y - CURB_H * 0.75 };
  return [top, bottom, bottomOut, topOut, topOutLip, bottomOutLip, bottomLip, topLip]
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

export function pbSceneGeometry() {
  const s = PICKLEBALL_SURFACE;
  const surround = surroundRect();
  const tl = pbProjectFlat(s.x, s.y);
  const tr = pbProjectFlat(s.x + s.w, s.y);
  const bl = pbProjectFlat(s.x, s.y + s.h);
  const br = pbProjectFlat(s.x + s.w, s.y + s.h);

  return {
    surround: pbProjectRect(surround),
    floor: pbProjectRect(s),
    leftCurb: curbQuad('left'),
    rightCurb: curbQuad('right'),
    corners: { tl, tr, bl, br },
    net: pbNetLayout(),
  };
}

export type PbNetLayout = {
  left: Pt;
  right: Pt;
  floorY: number;
  span: number;
  centerX: number;
};

/** Net line on the court center — spans sideline to sideline at constant depth. */
export function pbNetLayout(): PbNetLayout {
  const s = PICKLEBALL_SURFACE;
  const left = pbProjectFlat(s.x, PICKLEBALL_NET_Y);
  const right = pbProjectFlat(s.x + s.w, PICKLEBALL_NET_Y);
  return {
    left,
    right,
    floorY: left.y,
    span: right.x - left.x,
    centerX: (left.x + right.x) / 2,
  };
}

export function pbLinePaths(): string[] {
  const s = PICKLEBALL_SURFACE;
  const { x: sx, y: sy, w: sw, h: sh } = s;

  const outline = pbProjectPoly([
    { x: sx, y: sy },
    { x: sx + sw, y: sy },
    { x: sx + sw, y: sy + sh },
    { x: sx, y: sy + sh },
    { x: sx, y: sy },
  ]);

  const nvzTop = pbProjectPoly([
    { x: sx, y: PB_NVZ_TOP_Y },
    { x: sx + sw, y: PB_NVZ_TOP_Y },
  ]);
  const nvzBottom = pbProjectPoly([
    { x: sx, y: PB_NVZ_BOTTOM_Y },
    { x: sx + sw, y: PB_NVZ_BOTTOM_Y },
  ]);
  const centerTop = pbProjectPoly([
    { x: PB_CENTER_X, y: sy },
    { x: PB_CENTER_X, y: PB_NVZ_TOP_Y },
  ]);
  const centerBottom = pbProjectPoly([
    { x: PB_CENTER_X, y: PB_NVZ_BOTTOM_Y },
    { x: PB_CENTER_X, y: sy + sh },
  ]);

  return [outline, nvzTop, nvzBottom, centerTop, centerBottom];
}

/** Tight viewBox from projected geometry — avoids large empty bands in the SVG. */
function computePbSceneViewBox(): { minX: number; minY: number; w: number; h: number } {
  const scene = pbSceneGeometry();
  const lines = pbLinePaths();
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

  minY = Math.min(minY, scene.net.floorY - 13);
  maxY = Math.max(maxY, scene.corners.bl.y + 13);
  maxY = Math.max(maxY, pbProjectFlat(PB_CENTER_X, PICKLEBALL_SURFACE.y + PICKLEBALL_SURFACE.h).y + 18);

  const flat = pbServeFlatPoints({
    serverTeam: 'teamA',
    courtEndsSwapped: false,
    serveRight: true,
    matchDoubles: true,
    serverPlayerIndex: 0,
  });
  const serveStart = pbProjectFlat(flat.start.x, flat.start.y);
  const serveEnd = pbProjectFlat(flat.end.x, flat.end.y);
  const serveControlFlat = pbProjectFlat(flat.control.x, flat.control.y);
  const serveLift = Math.max(12, Math.abs(serveStart.y - serveEnd.y) * 0.28);
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
  const minXp = Math.floor(minX - padX);
  const minYp = Math.floor(minY - padTop);
  const maxXp = Math.ceil(maxX + padX);
  const maxYp = Math.ceil(maxY + padBottom);

  return { minX: minXp, minY: minYp, w: maxXp - minXp, h: maxYp - minYp };
}

const _pbSceneViewBox = computePbSceneViewBox();
export const PB_SCENE_MIN_X = _pbSceneViewBox.minX;
export const PB_SCENE_MIN_Y = _pbSceneViewBox.minY;
export const PB_SCENE_VB_W = _pbSceneViewBox.w;
export const PB_SCENE_VB_H = _pbSceneViewBox.h;
export const PB_SCENE_VIEW_BOX = `${PB_SCENE_MIN_X} ${PB_SCENE_MIN_Y} ${PB_SCENE_VB_W} ${PB_SCENE_VB_H}`;

export function pbScenePct(fx: number, fy: number) {
  const p = pbProjectFlat(fx, fy);
  return pbScenePctFromPt(p);
}

export function pbScenePctFromPt(p: Pt) {
  return {
    leftPct: ((p.x - PB_SCENE_MIN_X) / PB_SCENE_VB_W) * 100,
    topPct: ((p.y - PB_SCENE_MIN_Y) / PB_SCENE_VB_H) * 100,
  };
}

export type PbSceneServeTrace = {
  start: Pt;
  control: Pt;
  end: Pt;
  arrowD: string;
  ballLeftPct: number;
  ballTopPct: number;
};

function pbArcControl(start: Pt, end: Pt, flatControl: Pt): Pt {
  const projected = pbProjectFlat(flatControl.x, flatControl.y);
  return serveArcControlLifted(start, end, projected);
}

export function pbSceneServeGuideArtifacts(opts: Parameters<typeof pbServeFlatPoints>[0]): {
  ball: Pt;
  flatControl: Pt;
  ballLeftPct: number;
  ballTopPct: number;
} {
  const flat = pbServeFlatPoints(opts);
  const flatControl = pbProjectFlat(flat.control.x, flat.control.y);
  const ballPt = pbProjectFlat(flat.start.x, flat.start.y);
  const ball = pbScenePctFromPt(ballPt);
  return { ball: ballPt, flatControl, ballLeftPct: ball.leftPct, ballTopPct: ball.topPct };
}

export function pbSceneServeOverlay(
  opts: Parameters<typeof pbServeFlatPoints>[0],
  endpoints?: { from: Pt; to: Pt }
): PbSceneServeTrace {
  const flat = pbServeFlatPoints(opts);
  const start = endpoints?.from ?? pbProjectFlat(flat.start.x, flat.start.y);
  const end = endpoints?.to ?? pbProjectFlat(flat.end.x, flat.end.y);
  const control = pbArcControl(start, end, flat.control);
  const ball = pbScenePctFromPt(start);

  return {
    start,
    control,
    end,
    arrowD: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
    ballLeftPct: ball.leftPct,
    ballTopPct: ball.topPct,
  };
}

export const pbQuadPoint = serveArcQuadPoint;

/** Progressive arc path for animated serve trace (mirrors squash line trim). */
export const pbArcPathPartial = serveArcPathPartial;

export function pbSceneServiceBox(end: 'top' | 'bottom', side: 'left' | 'right'): string {
  return pbProjectRect(pbServiceBoxRect(end, side));
}
