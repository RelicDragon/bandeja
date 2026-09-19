import { Loader2 } from 'lucide-react';
import { APP_HEADER_HEIGHT_REM } from '@/components/refreshIndicatorLayout';

/**
 * CSS-variable driven twin of `RefreshIndicator`. The inbox publishes the pull
 * straight to `--chat-pull-distance` / `--chat-pull-progress` instead of React
 * state, so dragging never re-renders the list. Stays mounted at opacity 0 when
 * there is no pull.
 */
export const ChatListPullIndicator = ({ isRefreshing }: { isRefreshing: boolean }) => (
  <div
    data-testid="chat-list-pull-indicator"
    className="fixed left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none"
    style={{
      top: `calc(${APP_HEADER_HEIGHT_REM}rem + env(safe-area-inset-top) + var(--chat-pull-distance, 0px) / 2)`,
      opacity: 'min(calc(var(--chat-pull-progress, 0) * 2), 1)',
      visibility: 'var(--chat-pull-visibility, hidden)' as React.CSSProperties['visibility'],
    }}
  >
    <div className="bg-white dark:bg-gray-800 rounded-full p-2.5 shadow-lg border border-gray-200 dark:border-gray-700">
      {isRefreshing ? (
        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      ) : (
        <svg
          className="w-5 h-5 text-blue-500"
          style={{
            transform: 'rotate(calc(var(--chat-pull-progress, 0) * 360deg))',
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
