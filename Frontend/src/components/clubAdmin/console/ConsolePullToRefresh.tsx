import type { ReactNode } from 'react';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useClubAdminScrollContainer } from '@/components/clubAdmin/ClubAdminScrollContext';

/** Pull-to-refresh on the console content scroller. */
export function ConsolePullToRefresh({ onRefresh, children, disabled }: { onRefresh: () => Promise<unknown>; children: ReactNode; disabled?: boolean }) {
  const scrollRef = useClubAdminScrollContainer();
  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: async () => {
      await onRefresh();
    },
    disabled,
    scrollContainerRef: scrollRef ?? undefined,
  });
  return (
    <>
      <RefreshIndicator isRefreshing={isRefreshing} pullDistance={pullDistance} pullProgress={pullProgress} />
      <div
        style={
          pullDistance > 0 || isRefreshing
            ? { transform: `translateY(${pullDistance}px)`, transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.25s ease-out' }
            : undefined
        }
      >
        {children}
      </div>
    </>
  );
}
