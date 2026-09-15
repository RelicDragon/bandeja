import { memo, type ReactNode } from 'react';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface PullToRefreshShellProps {
  onRefresh: () => Promise<void>;
  disabled?: boolean;
  children: (state: { isRefreshing: boolean }) => ReactNode;
}

// Pull distance changes every gesture frame; content only depends on refresh state
// and the parent's render callback. Keep those updates outside the content tree.
const PullToRefreshContent = memo(function PullToRefreshContent({
  children,
  isRefreshing,
}: Pick<PullToRefreshShellProps, 'children'> & { isRefreshing: boolean }) {
  return children({ isRefreshing });
});

export function PullToRefreshShell({ onRefresh, disabled, children }: PullToRefreshShellProps) {
  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({ onRefresh, disabled });
  const applyTransform = pullDistance > 0 || isRefreshing;

  return (
    <>
      <RefreshIndicator
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
      />
      <div
        style={
          applyTransform
            ? {
                transform: `translateY(${pullDistance}px)`,
                transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.3s ease-out',
              }
            : undefined
        }
      >
        <PullToRefreshContent isRefreshing={isRefreshing}>{children}</PullToRefreshContent>
      </div>
    </>
  );
}
