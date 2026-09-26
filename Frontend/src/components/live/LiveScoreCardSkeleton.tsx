import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { LIVE_CARD_WIDTH_PX } from './LiveScoreCard';

/**
 * PRD 349 — loading state: one score card with shimmering blocks.
 *
 * `shimmerBlock` is the house skeleton primitive; the blocks mirror the real
 * card row for row (venue, two scoreboard rows, footer) so the rail does not
 * resize when the data lands.
 */
function SkeletonRow() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1.5 rtl:space-x-reverse">
        <div className={`${shimmerBlock} h-6 w-6 rounded-full`} />
        <div className={`${shimmerBlock} h-6 w-6 rounded-full`} />
      </div>
      <div className={`${shimmerBlock} h-3 flex-1`} />
      <div className={`${shimmerBlock} h-6 w-5 rounded`} />
      <div className={`${shimmerBlock} h-6 w-8 rounded-md`} />
    </div>
  );
}

export function LiveScoreCardSkeleton() {
  return (
    <div
      className="flex shrink-0 flex-col gap-2.5 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60"
      style={{ width: LIVE_CARD_WIDTH_PX }}
      data-testid="live-score-card-skeleton"
      aria-hidden
    >
      <div className="flex items-center gap-2">
        <div className={`${shimmerBlock} h-5 w-5 rounded-md`} />
        <div className={`${shimmerBlock} h-3 w-32`} />
      </div>
      <div className="flex flex-col gap-1.5">
        <SkeletonRow />
        <SkeletonRow />
      </div>
      <div className="flex items-center justify-between">
        <div className={`${shimmerBlock} h-3 w-24`} />
        <div className={`${shimmerBlock} h-6 w-16 rounded-full`} />
      </div>
    </div>
  );
}
