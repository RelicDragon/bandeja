import { shimmerBlock } from '@/components/motion/shimmerBlock';

export function MarketItemCardSkeleton() {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800/80 dark:shadow-black/20"
      aria-hidden
    >
      <div className={`aspect-square w-full flex-shrink-0 ${shimmerBlock}`} />
      <div className="space-y-2 p-2">
        <div className={`h-3.5 w-[85%] rounded-full ${shimmerBlock}`} />
        <div className={`h-3 w-1/2 rounded-full ${shimmerBlock}`} />
        <div className={`h-5 w-16 rounded-md ${shimmerBlock}`} />
      </div>
    </div>
  );
}
