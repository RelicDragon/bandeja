import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export function MarketplaceRefreshingBar({ show }: { show: boolean }) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return show ? <div className="mb-3 h-0.5 rounded-full bg-primary-500/40" aria-hidden /> : null;
  }

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="refresh-bar"
          className="mb-3 h-0.5 overflow-hidden rounded-full bg-primary-500/15 dark:bg-primary-400/15"
          initial={{ opacity: 0, scaleX: 0.3 }}
          animate={{ opacity: 1, scaleX: 1 }}
          exit={{ opacity: 0, scaleX: 0.3 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ transformOrigin: 'left center' }}
          aria-hidden
        >
          <motion.div
            className="h-full w-1/3 rounded-full bg-primary-500 dark:bg-primary-400"
            animate={{ x: ['-120%', '360%'] }}
            transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
