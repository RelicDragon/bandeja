import { motion } from 'framer-motion';
import { TennisBallIcon } from '@/components/icons/TennisBallIcon';
import { serveSpringTransition } from '../serveArrowMotion';

type TennisBallMarkerProps = {
  leftPct: number;
  topPct: number;
};

export function TennisBallMarker({ leftPct, topPct }: TennisBallMarkerProps) {
  return (
    <motion.div
      className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      initial={false}
      animate={{ left: `${leftPct}%`, top: `${topPct}%` }}
      transition={serveSpringTransition}
      aria-hidden
    >
      <TennisBallIcon size={20} className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]" />
    </motion.div>
  );
}
