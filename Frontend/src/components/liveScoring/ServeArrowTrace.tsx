import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent } from 'framer-motion';

import { serveSpringTransition, serveThrowDuration, serveThrowEase } from './serveArrowMotion';
import { SERVE_TRACE_STROKE_CLASS, SERVE_TRACE_TIP_CLASS } from './serveTraceStyles';

const ARROW_DASH = 5.25;
const ARROW_GAP = 5.25;
const ARROW_STROKE = 2.1;
const ARROW_DASH_PATTERN = `${ARROW_DASH} ${ARROW_GAP}`;

type PathTip = { x: number; y: number; rot: number };

function pathTipAt(path: SVGPathElement, len: number, t: number): PathTip {
  const clamped = Math.max(0, Math.min(1, t));
  const at = clamped * len;
  const pt = path.getPointAtLength(at);
  const back = Math.max(0, at - 2);
  const toAt = clamped >= 1 ? len : Math.min(len, at + 2);
  const from = path.getPointAtLength(back);
  const to = path.getPointAtLength(Math.max(back + 0.01, toAt));
  const rot = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  return { x: pt.x, y: pt.y, rot };
}

/** Mask stroke — reveals path length from origin (ball) toward the tip. */
function maskRevealAt(len: number, p: number): { strokeDasharray: string; strokeDashoffset: number } {
  if (len <= 0) return { strokeDasharray: '0 1', strokeDashoffset: 0 };
  const t = Math.max(0, Math.min(1, p));
  return { strokeDasharray: `${len} ${len}`, strokeDashoffset: len * (1 - t) };
}

type ServeArrowTraceProps = {
  d: string;
  motionKey: string;
  viewBox: string;
  strokeClassName?: string;
  tipClassName?: string;
};

/** Dashed serve arc that grows from path start (ball) to target; arrowhead follows the tip. */
export function ServeArrowTrace({
  d,
  motionKey,
  viewBox,
  strokeClassName = SERVE_TRACE_STROKE_CLASS,
  tipClassName = SERVE_TRACE_TIP_CLASS,
}: ServeArrowTraceProps) {
  const maskId = useId().replace(/:/g, '');
  const pathRef = useRef<SVGPathElement>(null);
  const progress = useMotionValue(0);
  const [tip, setTip] = useState<PathTip | null>(null);
  const [maskReveal, setMaskReveal] = useState({ strokeDasharray: '0 1', strokeDashoffset: 0 });

  const syncFrame = (p: number) => {
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    if (len <= 0) return;
    setMaskReveal(maskRevealAt(len, p));
    setTip(pathTipAt(el, len, p));
  };

  useLayoutEffect(() => {
    progress.set(0);
    syncFrame(0);
  }, [d, progress]);

  useMotionValueEvent(progress, 'change', syncFrame);

  useEffect(() => {
    let cancelled = false;

    const runThrow = () => {
      const el = pathRef.current;
      const len = el?.getTotalLength() ?? 0;
      if (!el || len <= 0) {
        requestAnimationFrame(runThrow);
        return;
      }

      void (async () => {
        progress.stop();
        progress.set(0);
        syncFrame(0);

        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (cancelled) return;

        await animate(progress, 1, { duration: serveThrowDuration, ease: serveThrowEase });
      })();
    };

    runThrow();

    return () => {
      cancelled = true;
      progress.stop();
    };
  }, [motionKey, d, progress]);

  return (
    <svg viewBox={viewBox} className="absolute inset-0 size-full overflow-visible" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          <path
            d={d}
            fill="none"
            stroke="white"
            strokeWidth={ARROW_STROKE + 4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={maskReveal.strokeDasharray}
            strokeDashoffset={maskReveal.strokeDashoffset}
          />
        </mask>
      </defs>
      <path
        ref={pathRef}
        d={d}
        fill="none"
        className={strokeClassName}
        strokeWidth={ARROW_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={ARROW_DASH_PATTERN}
        strokeDashoffset={0}
        mask={`url(#${maskId})`}
        opacity={0.88}
      />
      {tip ? (
        <g transform={`translate(${tip.x} ${tip.y}) rotate(${tip.rot})`}>
          <polygon points="0,-2.4 4.8,0 0,2.4" className={tipClassName} opacity={0.95} />
        </g>
      ) : null}
    </svg>
  );
}

type ServeBallMarkerProps = {
  leftPct: number;
  topPct: number;
};

export function ServeBallMarker({ leftPct, topPct }: ServeBallMarkerProps) {
  return (
    <motion.div
      className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      initial={false}
      animate={{ left: `${leftPct}%`, top: `${topPct}%` }}
      transition={serveSpringTransition}
    >
      <span className="size-5 shrink-0 rounded-full border border-lime-950/30 bg-gradient-to-br from-[#f4ff9a] via-[#e8fc38] to-[#b8cf0a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.75),inset_0_-2px_3px_rgba(0,0,0,0.12),0_1px_3px_rgba(0,0,0,0.35),0_0_12px_rgba(220,252,80,0.55)]" />
    </motion.div>
  );
}
