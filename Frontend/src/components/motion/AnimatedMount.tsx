import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CONTENT_ENTER_Y, LAYOUT_TRANSITION, PANEL_EXIT_Y, PANEL_TRANSITION } from './motionTokens';

interface AnimatedMountProps {
  show?: boolean;
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Animate sibling reflow when this block mounts (opacity only — no vertical slide). */
  layout?: boolean;
}

export function AnimatedMount({
  show = true,
  children,
  className,
  delay = 0,
  layout = false,
}: AnimatedMountProps) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return show ? <div className={className}>{children}</div> : null;
  }

  if (layout) {
    return (
      <AnimatePresence initial={false}>
        {show ? (
          <motion.div
            key="layout-mount"
            layout
            className={className}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 0.22, ease: 'easeOut', delay },
              layout: LAYOUT_TRANSITION,
            }}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="animated-mount"
          className={className}
          initial={{ opacity: 0, y: CONTENT_ENTER_Y, scale: 0.99 }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            transition: { ...PANEL_TRANSITION, delay },
          }}
          exit={{ opacity: 0, y: PANEL_EXIT_Y, scale: 0.99, transition: PANEL_TRANSITION }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
