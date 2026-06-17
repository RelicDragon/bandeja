import { motion } from 'framer-motion';
import { STAGGER_CHILDREN, STAGGER_DELAY_CHILDREN, STAGGER_ITEM_TRANSITION } from '@/components/motion/motionTokens';
import { MarketItemCardSkeleton } from './MarketItemCardSkeleton';

const GRID_CLASS =
  'flex flex-wrap gap-2 [&>*]:w-[calc(50%-4px)] sm:[&>*]:w-[calc(33.333%-6px)] sm:[&>*]:max-w-[200px]';

const skeletonItemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      ...STAGGER_ITEM_TRANSITION,
      delay: STAGGER_DELAY_CHILDREN + index * STAGGER_CHILDREN,
    },
  }),
};

interface MarketplaceLoadingSkeletonProps {
  count?: number;
}

export function MarketplaceLoadingSkeleton({ count = 6 }: MarketplaceLoadingSkeletonProps) {
  return (
    <div className={GRID_CLASS} aria-busy="true">
      {Array.from({ length: count }).map((_, index) => (
        <motion.div
          key={index}
          custom={index}
          variants={skeletonItemVariants}
          initial="hidden"
          animate="visible"
        >
          <MarketItemCardSkeleton />
        </motion.div>
      ))}
    </div>
  );
}
