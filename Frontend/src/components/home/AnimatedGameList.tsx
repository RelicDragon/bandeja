import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'framer-motion';

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
  const hasShownItemsRef = useRef(false);
  const shouldAnimateEntrance = hasShownItemsRef.current;

  useEffect(() => {
    if (items.length > 0) {
      hasShownItemsRef.current = true;
    }
  }, [items.length]);

  return (
    <div className={className}>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <motion.div
            key={getKey(item)}
            layout
            custom={index}
            variants={itemVariants}
            initial={shouldAnimateEntrance ? 'hidden' : false}
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
