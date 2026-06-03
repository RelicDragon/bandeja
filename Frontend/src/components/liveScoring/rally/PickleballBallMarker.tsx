import { motion } from 'framer-motion';
import { PickleballBallIcon } from '@/components/icons/PickleballBallIcon';
import { serveSpringTransition } from '../serveArrowMotion';

type PickleballBallMarkerProps = {
  leftPct: number;
  topPct: number;
};

export function PickleballBallMarker({ leftPct, topPct }: PickleballBallMarkerProps) {
  return (
    <motion.div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      initial={false}
      animate={{ left: `${leftPct}%`, top: `${topPct}%` }}
      transition={serveSpringTransition}
      aria-hidden
    >
      <PickleballBallIcon size={16} className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" />
    </motion.div>
  );
}
