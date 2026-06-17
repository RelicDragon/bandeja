import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { PANEL_ENTER_Y, PANEL_EXIT_Y, PANEL_TRANSITION } from './motionTokens';

interface AnimatedLoadingSwapProps {
  isLoading: boolean;
  loading: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AnimatedLoadingSwap({
  isLoading,
  loading,
  children,
  className,
}: AnimatedLoadingSwapProps) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{isLoading ? loading : children}</div>;
  }

  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: PANEL_ENTER_Y }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: PANEL_EXIT_Y }}
            transition={PANEL_TRANSITION}
          >
            {loading}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: PANEL_ENTER_Y }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: PANEL_EXIT_Y }}
            transition={PANEL_TRANSITION}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
