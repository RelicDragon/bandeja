import { type ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

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
      delay: Math.min(index * 0.05, 0.35),
    },
  }),
};

interface AnimatedGameListProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  className?: string;
}

export function AnimatedGameList<T>({
  items,
  getKey,
  renderItem,
  className = 'space-y-4 pb-8',
}: AnimatedGameListProps<T>) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return (
      <div className={className}>
        {items.map((item) => (
          <div key={getKey(item)}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <AnimatePresence initial={false}>
        {items.map((item, index) => (
          <motion.div
            key={getKey(item)}
            custom={index}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
          >
            {renderItem(item)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
