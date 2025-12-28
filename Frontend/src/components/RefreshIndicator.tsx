import { Loader2 } from 'lucide-react';

interface RefreshIndicatorProps {
  isRefreshing: boolean;
  pullDistance: number;
  pullProgress: number;
}

export const RefreshIndicator = ({
  isRefreshing,
  pullDistance,
  pullProgress,
}: RefreshIndicatorProps) => {
  if (pullDistance === 0) return null;

  const rotation = isRefreshing ? 0 : pullProgress * 360;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      style={{
        top: `calc(4rem + env(safe-area-inset-top) + ${Math.min(pullDistance * 0.6, 40)}px)`,
        opacity: Math.min(pullProgress * 2, 1),
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-full p-2.5 shadow-lg border border-gray-200 dark:border-gray-700">
        {isRefreshing ? (
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        ) : (
          <svg
            className="w-5 h-5 text-blue-500"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: 'transform 0.1s ease-out',
            }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        )}
      </div>
    </div>
  );
};

