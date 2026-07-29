import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

type Props = {
  /** Compatible cluster size toward a full match (includes viewer). */
  current: number;
  needed: number;
  /** Compatible players not already participating in an actual game. */
  freeCount: number;
};

export function PlayIntentClusterProgress({ current, needed, freeCount }: Props) {
  const { t } = useTranslation();
  const safeNeeded = Math.max(0, needed);
  const safeCurrent = Math.max(0, Math.min(current, safeNeeded || current));
  const isFull = safeNeeded > 0 && safeCurrent >= safeNeeded;
  const fillPercent =
    safeNeeded > 0 ? Math.round(Math.min(safeCurrent / safeNeeded, 1) * 100) : 0;
  const safeFree = Math.max(0, freeCount);

  return (
    <div className="space-y-3" data-testid="play-intent-cluster-progress">
      <div className="flex justify-end">
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <span
            className="rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold tabular-nums text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-400/10 dark:text-emerald-300"
            data-testid="play-intent-free-count"
          >
            {t('playIntent.freeNow', { count: safeFree })}
          </span>
          <span className="text-sm font-bold tabular-nums text-gray-700 dark:text-gray-200">
            {safeCurrent}
            <span className="font-medium text-gray-400 dark:text-gray-500">
              /{safeNeeded || '–'}
            </span>
          </span>
        </div>
      </div>

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
