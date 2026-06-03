import {
  SQ_SURFACE,
  SQ_WALL_OUT_LINE_H,
  SQ_WALL_SCREEN_H,
  SQ_WALL_SERVICE_LINE_H,
  SQ_WALL_TIN_TOP_H,
} from './squashCourtGeometry';
import { sqProjectFlat } from './squashCourtLayout';

type Pt = { x: number; y: number };

export {
  SQ_WALL_CEILING_CLEAR_M,
  SQ_WALL_OUT_LINE_H,
  SQ_WALL_SERVICE_LINE_H,
  SQ_WALL_TIN_TOP_H,
} from './squashCourtGeometry';

export type SqWallSegment = { x1: number; y1: number; x2: number; y2: number };

function wallCrest(base: Pt): Pt {
  return { x: base.x, y: base.y - SQ_WALL_SCREEN_H * 0.92 };
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function wallBand(fl: Pt, fr: Pt, flt: Pt, frt: Pt, r0: number, r1: number): string {
  const bl = lerpPt(fl, flt, r0);
  const br = lerpPt(fr, frt, r0);
  const tl = lerpPt(fl, flt, r1);
  const tr = lerpPt(fr, frt, r1);
  return `${bl.x},${bl.y} ${br.x},${br.y} ${tr.x},${tr.y} ${tl.x},${tl.y}`;
}

function wallLine(fl: Pt, fr: Pt, flt: Pt, frt: Pt, r: number): SqWallSegment {
  const l = lerpPt(fl, flt, r);
  const right = lerpPt(fr, frt, r);
  return { x1: l.x, y1: l.y, x2: right.x, y2: right.y };
}

/** Normalized height on the drawn front wall (playable top = out line at 4.57 m). */
function wallMarkRatio(heightM: number): number {
  return heightM / SQ_WALL_OUT_LINE_H;
}

export type SqFrontWallScene = {
  /** Full front-wall panel (floor → visual crest). */
  face: string;
  /** Trapezoid perimeter for structural outline. */
  wallOutline: string;
  /** Lower edge of front wall (out) line — 4570 mm. */
  outLine: SqWallSegment;
  /** Lower edge of service line — 1780 mm. */
  serviceLine: SqWallSegment;
  /** Top of tin / upper edge of board — 480 mm. */
  tinTopLine: SqWallSegment;
  serveTargetY: number;
};

/** Front wall — WSF marks projected onto the perspective panel. */
export function sqFrontWallScene(): SqFrontWallScene {
  const { x: sx, y: sy, w: sw } = SQ_SURFACE;
  const fl = sqProjectFlat(sx, sy);
  const fr = sqProjectFlat(sx + sw, sy);
  const flt = wallCrest(fl);
  const frt = wallCrest(fr);

  const tinR = wallMarkRatio(SQ_WALL_TIN_TOP_H);
  const svcR = wallMarkRatio(SQ_WALL_SERVICE_LINE_H);
  const serveR = svcR + (1 - svcR) * 0.42;
  const serveBand = wallLine(fl, fr, flt, frt, serveR);

  return {
    face: wallBand(fl, fr, flt, frt, 0, 1),
    wallOutline: `${fl.x},${fl.y} ${fr.x},${fr.y} ${frt.x},${frt.y} ${flt.x},${flt.y}`,
    outLine: wallLine(fl, fr, flt, frt, 1),
    serviceLine: wallLine(fl, fr, flt, frt, svcR),
    tinTopLine: wallLine(fl, fr, flt, frt, tinR),
    serveTargetY: (serveBand.y1 + serveBand.y2) / 2,
  };
}
