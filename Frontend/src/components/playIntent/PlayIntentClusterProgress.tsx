import { motion } from 'framer-motion';

type Props = {
  /** Compatible cluster size toward a full match (includes viewer). */
  current: number;
  needed: number;
};

export function PlayIntentClusterProgress({ current, needed }: Props) {
  const safeNeeded = Math.max(0, needed);
  const safeCurrent = Math.max(0, Math.min(current, safeNeeded || current));
  const isFull = safeNeeded > 0 && safeCurrent >= safeNeeded;
  const fillPercent =
    safeNeeded > 0 ? Math.round(Math.min(safeCurrent / safeNeeded, 1) * 100) : 0;

  return (
    <div data-testid="play-intent-cluster-progress">
      {safeNeeded > 0 && (
        <div
          className="relative h-2 overflow-hidden rounded-full bg-gray-100 ring-1 ring-inset ring-black/[0.025] dark:bg-white/[0.08] dark:ring-white/[0.04]"
          role="progressbar"
          aria-valuenow={safeCurrent}
          aria-valuemin={0}
          aria-valuemax={safeNeeded}
        >
          <motion.div
            className={`relative h-full overflow-hidden rounded-full bg-gradient-to-r ${
              isFull
                ? 'from-emerald-400 via-emerald-500 to-lime-400'
                : 'from-sky-400 via-cyan-400 to-emerald-400'
            }`}
            initial={false}
            animate={{ width: `${fillPercent}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          >
            <span
              className="absolute inset-0 bg-[linear-gradient(110deg,transparent_15%,rgba(255,255,255,0.5)_45%,transparent_70%)]"
              aria-hidden
            />
          </motion.div>
        </div>
      )}
    </div>
  );
}
