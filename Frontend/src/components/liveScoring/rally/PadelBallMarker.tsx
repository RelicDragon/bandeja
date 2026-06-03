import { motion } from 'framer-motion';
import { PadelBallIcon } from '@/components/icons/PadelBallIcon';
import { serveSpringTransition } from '../serveArrowMotion';

type PadelBallMarkerProps = {
  leftPct: number;
  topPct: number;
};

export function PadelBallMarker({ leftPct, topPct }: PadelBallMarkerProps) {
  return (
    <motion.div
      className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      initial={false}
      animate={{ left: `${leftPct}%`, top: `${topPct}%` }}
      transition={serveSpringTransition}
      aria-hidden
    >
      <PadelBallIcon
        size={20}
        className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.35),0_0_10px_rgba(220,252,80,0.45)]"
      />
    </motion.div>
  );
}
