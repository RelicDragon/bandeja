import { type ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Stagger stays short on purpose: the old 50ms/card ramp (capped at 350ms) made
 * a day switch feel like a load rather than a swap, because the last visible
 * card only settled a third of a second after the data was already on screen.
 */
const STAGGER_STEP_S = 0.02;
const STAGGER_MAX_S = 0.1;

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 320,
      damping: 28,
      delay: Math.min(index * STAGGER_STEP_S, STAGGER_MAX_S),
    },
  }),
};

const exitTransition = { opacity: 0, scale: 0.96, transition: { duration: 0.18 } };

interface AnimatedGameListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  className?: string;
  /**
   * Identifies the set the items belong to — pass it only where a change means
   * a wholesale turnover with no surviving rows (e.g. the Find calendar's
   * selected day). The presence context is then rebuilt, so the outgoing cards
   * unmount at once and the incoming ones appear without an enter animation
   * instead of both sets being mounted through a cross-fade. Leave it unset for
   * lists that gain and lose individual rows, so those still animate.
   */
  presenceKey?: string;
}

export function AnimatedGameList<T>({
  items,
  getKey,
  renderItem,
  className = 'space-y-4 pb-8',
  presenceKey,
}: AnimatedGameListProps<T>) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return (
      <div className={`relative ${className}`}>
        {items.map((item) => (
          <div key={getKey(item)}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  return (
    // `relative` is required by popLayout below: it positions exiting rows
    // absolutely, and without a positioned ancestor they animate out against
    // the wrong origin.
    <div className={`relative ${className}`}>
      {/* popLayout takes exiting rows out of flow immediately, so a removal does
          not hold `space-y` height while the rest reflows into place. */}
      <AnimatePresence initial={false} mode="popLayout" key={presenceKey}>
        {items.map((item, index) => (
          <motion.div
            key={getKey(item)}
            custom={index}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit={exitTransition}
          >
            {renderItem(item)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
