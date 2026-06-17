import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { PANEL_ENTER_Y, PANEL_EXIT_Y, PANEL_TRANSITION } from './motionTokens';

interface AnimatedPresencePanelProps {
  panelKey: string;
  children: ReactNode;
  className?: string;
  /** When false, skips enter animation on first mount only. Default: true */
  initial?: boolean;
}

export function AnimatedPresencePanel({
  panelKey,
  children,
  className,
  initial = true,
}: AnimatedPresencePanelProps) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={initial}>
      <motion.div
        key={panelKey}
        className={className}
        initial={{ opacity: 0, y: PANEL_ENTER_Y }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: PANEL_EXIT_Y }}
        transition={PANEL_TRANSITION}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
