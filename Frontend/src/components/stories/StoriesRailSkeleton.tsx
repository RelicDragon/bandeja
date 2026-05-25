type StoriesRailSkeletonProps = {
  count?: number;
};

export function StoriesRailSkeleton({ count = 5 }: StoriesRailSkeletonProps) {
  return (
    <div className="px-4 mb-3 max-w-md mx-auto">
      <div className="relative -mx-4 px-4 flex gap-3 overflow-x-auto overflow-y-hidden scrollbar-hide pb-1">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5 shrink-0">
            <div className="h-[4.25rem] w-[4.25rem] rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="h-2.5 w-12 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
