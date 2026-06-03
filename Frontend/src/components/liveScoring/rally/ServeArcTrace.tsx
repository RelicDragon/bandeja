import { useMemo } from 'react';
import { ServeArrowTrace } from '../ServeArrowTrace';
import { SERVE_TRACE_STROKE_CLASS, SERVE_TRACE_TIP_CLASS } from '../serveTraceStyles';
import {
  serveArcQuadraticD,
  serveArcTraceFromEndpoints,
  type ServeArcPt,
} from './serveArcGeometry';

type ServeArcTraceProps = {
  from: ServeArcPt;
  to: ServeArcPt;
  /** Projected net (or flat) point before lift — used when `control` is omitted. */
  flatControl?: ServeArcPt;
  /** Precomputed control (e.g. padel perpendicular bulge). */
  control?: ServeArcPt;
  motionKey: string;
  viewBox: string;
  ready?: boolean;
  minLift?: number;
  liftFactor?: number;
  strokeClassName?: string;
  tipClassName?: string;
};

export function ServeArcTrace({
  from,
  to,
  flatControl,
  control,
  motionKey,
  viewBox,
  ready = true,
  minLift = 12,
  liftFactor = 0.28,
  strokeClassName = SERVE_TRACE_STROKE_CLASS,
  tipClassName = SERVE_TRACE_TIP_CLASS,
}: ServeArcTraceProps) {
  const d = useMemo(() => {
    const trace = control
      ? { start: from, end: to, control }
      : serveArcTraceFromEndpoints(from, to, flatControl!, minLift, liftFactor);
    return serveArcQuadraticD(trace.start, trace.control, trace.end);
  }, [from, to, flatControl, control, minLift, liftFactor]);

  if (!ready) return null;

  return (
    <ServeArrowTrace
      d={d}
      motionKey={motionKey}
      viewBox={viewBox}
      strokeClassName={strokeClassName}
      tipClassName={tipClassName}
    />
  );
}
