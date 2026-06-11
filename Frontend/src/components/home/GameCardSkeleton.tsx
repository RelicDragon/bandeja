import { motion } from 'framer-motion';
import { Card } from '@/components';

export const GameCardSkeleton = () => (
  <Card className="overflow-hidden p-4">
    <div className="animate-pulse space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 w-1/3 rounded-full bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-1/2 rounded-full bg-gray-200 dark:bg-gray-700" />
        </div>
        <div className="h-6 w-14 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="h-3 w-2/3 rounded-full bg-gray-200 dark:bg-gray-700" />
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700" />
        ))}
        <div className="ml-auto h-8 w-20 rounded-lg bg-gray-200 dark:bg-gray-700" />
      </div>
    </div>
  </Card>
);

interface GamesLoadingSkeletonProps {
  count?: number;
  className?: string;
}

export const GamesLoadingSkeleton = ({
  count = 3,
  className = 'space-y-4 pb-8',
}: GamesLoadingSkeletonProps) => (
  <div className={className}>
    {Array.from({ length: count }).map((_, index) => (
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: index * 0.08, ease: 'easeOut' }}
      >
        <GameCardSkeleton />
      </motion.div>
    ))}
  </div>
);
