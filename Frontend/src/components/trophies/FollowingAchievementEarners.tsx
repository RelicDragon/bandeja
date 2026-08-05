import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';
import { useFollowingAchievementEarnersQuery } from '@/queries/useFollowingAchievementEarnersQuery';
import { useAuthStore } from '@/store/authStore';
import type { BasicUser } from '@/types';
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
      <div
        data-testid="following-achievement-earners-list"
        className="flex flex-wrap gap-1 px-1 py-1"
      >
          {users.map((user: BasicUser) => {
            const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
            return (
              <button
                key={user.id}
                type="button"
                className="flex min-h-11 max-w-40 items-center gap-1.5 rounded-xl px-1 text-left transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-white/[0.06]"
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
    </section>
  );
}
