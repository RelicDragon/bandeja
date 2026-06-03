import { motion } from 'framer-motion';
import { TableTennisBallIcon } from '@/components/icons/TableTennisBallIcon';
import { serveSpringTransition } from '../serveArrowMotion';

type TableTennisBallMarkerProps = {
  leftPct: number;
  topPct: number;
};

export function TableTennisBallMarker({ leftPct, topPct }: TableTennisBallMarkerProps) {
  return (
    <motion.div
      className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
      initial={false}
      animate={{ left: `${leftPct}%`, top: `${topPct}%` }}
      transition={serveSpringTransition}
      aria-hidden
    >
      <TableTennisBallIcon size={14} className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.28)]" />
    </motion.div>
  );
}
