import { useEffect, useRef, useState } from 'react';
import { animate, type AnimationPlaybackControls } from 'framer-motion';
import { serveThrowDuration, serveThrowEase } from '../serveArrowMotion';
import { SERVE_TRACE_STROKE_CLASS } from '../serveTraceStyles';
import { sqServeLinePath, type SqSceneServeTrace } from './squashCourtLayout';

const ARROW_DASH = 5.25;
const ARROW_GAP = 5.25;
const ARROW_STROKE = 2.1;
const DASH_PATTERN = `${ARROW_DASH} ${ARROW_GAP}`;
const LEG_MS = serveThrowDuration * 0.48 * 1000;

type SquashServeTraceProps = {
  trace: SqSceneServeTrace;
  motionKey: string;
  viewBox: string;
  ready?: boolean;
  strokeClassName?: string;
};

export function SquashServeTrace({
  trace,
  motionKey,
  viewBox,
  ready = true,
  strokeClassName = SERVE_TRACE_STROKE_CLASS,
}: SquashServeTraceProps) {
  const traceRef = useRef(trace);
  traceRef.current = trace;

  const [leg1D, setLeg1D] = useState(() => sqServeLinePath(trace.leg1.from, trace.leg1.to, 0));
  const [leg2D, setLeg2D] = useState<string | null>(null);

  useEffect(() => {
    const { leg1, leg2 } = traceRef.current;

    if (!ready) {
      setLeg1D(sqServeLinePath(leg1.from, leg1.to, 0));
      setLeg2D(null);
      return;
    }

    let cancelled = false;
    let ctrl1: AnimationPlaybackControls | undefined;
    let ctrl2: AnimationPlaybackControls | undefined;

    const run = async () => {
      setLeg1D(sqServeLinePath(leg1.from, leg1.to, 0));
      setLeg2D(null);

      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (cancelled) return;

      await new Promise<void>((resolve) => {
        ctrl1 = animate(0, 1, {
          duration: LEG_MS / 1000,
          ease: serveThrowEase,
          onUpdate: (t) => {
            if (cancelled) return;
            setLeg1D(sqServeLinePath(leg1.from, leg1.to, t));
          },
          onComplete: () => resolve(),
        });
      });
      if (cancelled) return;

      setLeg1D(sqServeLinePath(leg1.from, leg1.to, 1));
      setLeg2D(sqServeLinePath(leg2.from, leg2.to, 0));

      await new Promise<void>((resolve) => {
        ctrl2 = animate(0, 1, {
          duration: LEG_MS / 1000,
          ease: serveThrowEase,
          onUpdate: (t) => {
            if (cancelled) return;
            setLeg2D(sqServeLinePath(leg2.from, leg2.to, t));
          },
          onComplete: () => resolve(),
        });
      });
      if (cancelled) return;

      setLeg2D(sqServeLinePath(leg2.from, leg2.to, 1));
    };

    void run();

    return () => {
      cancelled = true;
      ctrl1?.stop();
      ctrl2?.stop();
    };
  }, [motionKey, ready]);

  return (
    <svg viewBox={viewBox} className="absolute inset-0 size-full" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d={leg1D}
        fill="none"
        className={strokeClassName}
        strokeWidth={ARROW_STROKE}
        strokeLinecap="round"
        strokeDasharray={DASH_PATTERN}
        opacity={0.88}
      />
      {leg2D ? (
        <path
          d={leg2D}
          fill="none"
          className={strokeClassName}
          strokeWidth={ARROW_STROKE}
          strokeLinecap="round"
          strokeDasharray={DASH_PATTERN}
          opacity={0.88}
        />
      ) : null}
    </svg>
  );
}
