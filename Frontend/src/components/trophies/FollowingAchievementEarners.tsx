import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';
import { useFollowingAchievementEarnersQuery } from '@/queries/useFollowingAchievementEarnersQuery';
import { useAuthStore } from '@/store/authStore';
import { formatFixtureMatrixPlayerName } from '@/utils/leagueFixtureMatrix';

type FollowingAchievementEarnersProps = {
  definitionId: string;
  open: boolean;
};

export function FollowingAchievementEarners({
  definitionId,
  open,
}: FollowingAchievementEarnersProps) {
  const { t } = useTranslation();
  const { openPlayerCard } = usePlayerCardModal();
  const railRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const viewerUserId = useAuthStore((state) => state.user?.id);
  const {
    data: users = [],
    isPending,
    isError,
    refetch,
  } = useFollowingAchievementEarnersQuery(
    viewerUserId,
    definitionId,
    open,
  );

  const updateFades = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScrollLeft = Math.max(0, rail.scrollWidth - rail.clientWidth);
    setShowLeftFade(rail.scrollLeft > 2);
    setShowRightFade(maxScrollLeft - rail.scrollLeft > 2);
  }, []);

  useEffect(() => {
    if (!open || users.length === 0) return;
    const rail = railRef.current;
    if (!rail) return;

    updateFades();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateFades);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [open, users, updateFades]);

  if (!viewerUserId || !open) return null;

  if (isPending) {
    return (
      <div
        data-testid="following-achievement-earners-loading"
        className="flex h-11 items-center gap-3 overflow-hidden"
        aria-label={t('common.loading')}
      >
        {[0, 1, 2].map((item) => (
          <span
            key={item}
            className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-gray-100 dark:bg-white/[0.06]"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <button
        type="button"
        className="w-full rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.08]"
        onClick={() => void refetch()}
      >
        {t('trophies.detail.followingEarnersError')}
      </button>
    );
  }

  if (users.length === 0) return null;

  return (
    <section
      data-testid="following-achievement-earners"
      className="space-y-2"
      aria-label={t('trophies.detail.followingEarners')}
    >
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
        {t('trophies.detail.followingEarners')}
      </p>
      <div className="relative min-w-0">
        {showLeftFade && (
          <div
            data-testid="following-achievement-earners-left-fade"
            className="pointer-events-none absolute inset-y-0 left-0 z-20 w-8 bg-gradient-to-r from-white via-white/90 to-transparent dark:from-gray-800 dark:via-gray-800/90"
            aria-hidden
          />
        )}
        <div
          ref={railRef}
          data-testid="following-achievement-earners-rail"
          className="flex gap-1 overflow-x-auto px-1 py-1 scrollbar-hide overscroll-x-contain [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]"
          onScroll={updateFades}
        >
          {users.map((user) => {
            const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
            return (
              <button
                key={user.id}
                type="button"
                className="flex min-h-11 max-w-40 shrink-0 items-center gap-1.5 rounded-xl px-1 text-left transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-white/[0.06]"
                aria-label={fullName}
                onClick={() => openPlayerCard(user.id)}
              >
                <PlayerAvatar
                  player={user}
                  showName={false}
                  inlineFace
                  extrasmall
                  asDiv
                />
                <span className="truncate whitespace-nowrap text-xs font-medium text-gray-900 dark:text-gray-50">
                  {formatFixtureMatrixPlayerName(user)}
                </span>
              </button>
            );
          })}
        </div>
        {showRightFade && (
          <div
            data-testid="following-achievement-earners-right-fade"
            className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-white via-white/90 to-transparent dark:from-gray-800 dark:via-gray-800/90"
            aria-hidden
          />
        )}
      </div>
    </section>
  );
}
