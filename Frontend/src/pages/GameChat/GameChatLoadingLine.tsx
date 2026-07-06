import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * A smooth, animated loading line that appears under the header.
 * Does not affect layout — sits as an overlay at the bottom of the header.
 */
export function GameChatLoadingLine({ show }: { show: boolean }) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return show ? (
      <div className="absolute bottom-0 left-0 right-0 z-[51] h-0.5 bg-primary-400/50" />
    ) : null;
  }

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          className="absolute bottom-0 left-0 right-0 z-[51] h-0.5 bg-gradient-to-r from-primary-400/0 via-primary-400/80 to-primary-400/0 dark:from-primary-500/0 dark:via-primary-500/80 dark:to-primary-500/0"
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          exit={{ opacity: 0, scaleX: 0 }}
          transition={{
            duration: 0.3,
            ease: 'easeInOut',
          }}
        >
          <motion.div
            className="h-full w-full bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/30"
            animate={{
              x: ['-100%', '100%'],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
