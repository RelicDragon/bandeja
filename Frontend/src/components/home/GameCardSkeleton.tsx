import { motion } from 'framer-motion';
import { Card } from '@/components';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { STAGGER_CHILDREN, STAGGER_DELAY_CHILDREN, STAGGER_ITEM_TRANSITION } from '@/components/motion/motionTokens';

export const GameCardSkeleton = () => (
  <Card className="overflow-hidden p-4">
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 shrink-0 rounded-full ${shimmerBlock}`} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className={`h-3.5 w-1/3 rounded-full ${shimmerBlock}`} />
          <div className={`h-3 w-1/2 rounded-full ${shimmerBlock}`} />
        </div>
        <div className={`h-6 w-14 shrink-0 rounded-full ${shimmerBlock}`} />
      </div>
      <div className={`h-3 w-2/3 rounded-full ${shimmerBlock}`} />
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-9 w-9 rounded-full ${shimmerBlock}`} />
        ))}
        <div className={`ml-auto h-8 w-20 rounded-lg ${shimmerBlock}`} />
      </div>
    </div>
  </Card>
);

interface GamesLoadingSkeletonProps {
  count?: number;
  className?: string;
}

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

export const GamesLoadingSkeleton = ({
  count = 3,
  className = 'space-y-4 pb-8',
}: GamesLoadingSkeletonProps) => (
  <div className={className} aria-busy="true">
    {Array.from({ length: count }).map((_, index) => (
      <motion.div
        key={index}
        custom={index}
        variants={skeletonItemVariants}
        initial="hidden"
        animate="visible"
      >
        <GameCardSkeleton />
      </motion.div>
    ))}
  </div>
);
