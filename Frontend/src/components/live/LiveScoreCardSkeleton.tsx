import { shimmerBlock } from '@/components/motion/shimmerBlock';

/**
 * PRD 349 — loading state: two score cards with shimmering digits.
 *
 * `shimmerBlock` is the house skeleton primitive; the digit blocks are sized
 * like real score text so the rail does not resize when the data lands.
 */
export function LiveScoreCardSkeleton() {
  return (
    <div
      className="flex w-[240px] shrink-0 snap-start flex-col gap-2 rounded-2xl border border-gray-200/70 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
      data-testid="live-score-card-skeleton"
      aria-hidden
    >
      <div className="flex items-center gap-2">
        <div className={`${shimmerBlock} h-6 w-6 rounded-full`} />
        <div className={`${shimmerBlock} h-3 flex-1`} />
      </div>
      <div className="flex items-center gap-2">
        <div className={`${shimmerBlock} h-8 w-14 rounded-xl`} />
        <div className={`${shimmerBlock} h-9 flex-1 rounded-xl`} />
        <div className={`${shimmerBlock} h-8 w-14 rounded-xl`} />
      </div>
      <div className={`${shimmerBlock} h-3 w-24`} />
    </div>
  );
}
