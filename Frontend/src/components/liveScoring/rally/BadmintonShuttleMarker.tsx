import { motion } from 'framer-motion';
import { ShuttlecockIcon } from '@/components/icons/ShuttlecockIcon';
import { serveSpringTransition } from '../serveArrowMotion';

type BadmintonShuttleMarkerProps = {
  leftPct: number;
  topPct: number;
};

export function BadmintonShuttleMarker({ leftPct, topPct }: BadmintonShuttleMarkerProps) {
  return (
    <motion.div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      initial={false}
      animate={{ left: `${leftPct}%`, top: `${topPct}%` }}
      transition={serveSpringTransition}
      aria-hidden
    >
      <ShuttlecockIcon size={18} className="text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]" />
    </motion.div>
  );
}
