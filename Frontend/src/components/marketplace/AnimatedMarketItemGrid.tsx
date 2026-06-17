import { type ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { STAGGER_ITEM_TRANSITION } from '@/components/motion/motionTokens';

const GRID_CLASS =
  'flex flex-wrap gap-2 [&>*]:w-[calc(50%-4px)] sm:[&>*]:w-[calc(33.333%-6px)] sm:[&>*]:max-w-[200px]';

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      ...STAGGER_ITEM_TRANSITION,
      delay: Math.min(index * 0.045, 0.4),
    },
  }),
  exit: {
    opacity: 0,
    scale: 0.94,
    transition: { duration: 0.18, ease: 'easeIn' },
  },
};

interface AnimatedMarketItemGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  className?: string;
  dimmed?: boolean;
}

export function AnimatedMarketItemGrid<T>({
  items,
  getKey,
  renderItem,
  className = '',
  dimmed = false,
}: AnimatedMarketItemGridProps<T>) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return (
      <div className={`${GRID_CLASS} ${className}`.trim()}>
        {items.map((item) => (
          <div key={getKey(item)}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      className={`${GRID_CLASS} ${className}`.trim()}
      animate={{ opacity: dimmed ? 0.55 : 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={getKey(item)}
            layout
            custom={index}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {renderItem(item)}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
