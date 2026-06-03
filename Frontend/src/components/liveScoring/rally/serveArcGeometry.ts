export type ServeArcPt = { x: number; y: number };

const ARC_SAMPLES = 28;

export function serveArcQuadPoint(start: ServeArcPt, control: ServeArcPt, end: ServeArcPt, t: number): ServeArcPt {
  const u = Math.max(0, Math.min(1, t));
  const o = 1 - u;
  return {
    x: o * o * start.x + 2 * o * u * control.x + u * u * end.x,
    y: o * o * start.y + 2 * o * u * control.y + u * u * end.y,
  };
}

/** Progressive quadratic arc path for animated serve trace (pickleball-style). */
export function serveArcPathPartial(start: ServeArcPt, control: ServeArcPt, end: ServeArcPt, t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const steps = Math.max(1, Math.ceil(u * ARC_SAMPLES));
  let d = `M ${start.x} ${start.y}`;
  for (let i = 1; i <= steps; i++) {
    const pt = serveArcQuadPoint(start, control, end, i / ARC_SAMPLES);
    d += ` L ${pt.x} ${pt.y}`;
  }
  return d;
}

export function serveArcControlLifted(
  start: ServeArcPt,
  end: ServeArcPt,
  projectedFlatControl: ServeArcPt,
  minLift = 12,
  liftFactor = 0.28,
): ServeArcPt {
  const lift = Math.max(minLift, Math.abs(start.y - end.y) * liftFactor);
  return { x: projectedFlatControl.x, y: projectedFlatControl.y - lift };
}

export type ServeArcTraceShape = {
  start: ServeArcPt;
  control: ServeArcPt;
  end: ServeArcPt;
};

export function serveArcTraceFromEndpoints(
  from: ServeArcPt,
  to: ServeArcPt,
  flatControl: ServeArcPt,
  minLift = 12,
  liftFactor = 0.28,
): ServeArcTraceShape {
  return {
    start: from,
    end: to,
    control: serveArcControlLifted(from, to, flatControl, minLift, liftFactor),
  };
}

/** Apex above the serve chord — high lob (screen Y up = smaller Y). */
export function serveArcControlApex(
  start: ServeArcPt,
  end: ServeArcPt,
  opts?: { minRise?: number; riseFactor?: number },
): ServeArcPt {
  const minRise = opts?.minRise ?? 36;
  const riseFactor = opts?.riseFactor ?? 0.52;
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const rise = Math.max(minRise, Math.hypot(end.x - start.x, end.y - start.y) * riseFactor);
  return { x: mx, y: my - rise };
}

/** Bulge perpendicular to the serve chord (clear lob on perspective courts). */
export function serveArcControlPerpendicular(
  start: ServeArcPt,
  end: ServeArcPt,
  opts?: { minBulge?: number; bulgeFactor?: number; towardLowerY?: boolean },
): ServeArcPt {
  const towardLowerY = opts?.towardLowerY ?? true;
  const minBulge = opts?.minBulge ?? 14;
  const bulgeFactor = opts?.bulgeFactor ?? 0.28;
  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: mx, y: my };
  const nx = -dy / len;
  const ny = dx / len;
  const bulge = Math.max(minBulge, len * bulgeFactor);
  const a = { x: mx + nx * bulge, y: my + ny * bulge };
  const b = { x: mx - nx * bulge, y: my - ny * bulge };
  if (towardLowerY) return a.y < b.y ? a : b;
  return a.y > b.y ? a : b;
}

export function serveArcQuadraticD(start: ServeArcPt, control: ServeArcPt, end: ServeArcPt): string {
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

/** Scene-space stop short of a target so the arc does not cross an avatar (24px base × scale). */
const SERVE_ARC_AVATAR_BASE_RADIUS = 12;

export function serveArcStopBeforeTarget(
  from: ServeArcPt,
  target: ServeArcPt,
  opts?: { targetRadius?: number; margin?: number }
): ServeArcPt {
  const radius = (opts?.targetRadius ?? SERVE_ARC_AVATAR_BASE_RADIUS) + (opts?.margin ?? 5);
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len <= radius) {
    const s = 0.12;
    return { x: target.x - dx * s, y: target.y - dy * s };
  }
  const t = (len - radius) / len;
  return { x: from.x + dx * t, y: from.y + dy * t };
}
