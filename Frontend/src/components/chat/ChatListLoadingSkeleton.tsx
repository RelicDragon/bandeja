export function ChatListSkeletonRows() {
  return (
    <>
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 animate-pulse" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
