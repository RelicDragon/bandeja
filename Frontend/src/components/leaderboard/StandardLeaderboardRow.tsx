import type { KeyboardEvent, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { LeaderboardEntry } from '@/api/ranking';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import {
  isRatingLeaderboardGrayed,
  ratingLeaderboardDeltaClass,
  ratingLeaderboardRankLabel,
} from '@/components/leaderboard/ratingLeaderboardDisplay';
import { usePlayerCardModal } from '@/hooks/usePlayerCardModal';

type StandardLeaderboardRowProps = {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
  leaderboardType: 'level' | 'social';
  displayValue: string;
  formatRatingDelta: (change: number) => string;
  rowRef: Ref<HTMLTableRowElement>;
  isInactiveSectionStart?: boolean;
};

export function StandardLeaderboardRow({
  entry,
  isCurrentUser,
  leaderboardType,
  displayValue,
  formatRatingDelta,
  rowRef,
  isInactiveSectionStart = false,
}: StandardLeaderboardRowProps) {
  const { t } = useTranslation();
  const { openPlayerCard } = usePlayerCardModal();
  const isGrayed = isRatingLeaderboardGrayed(leaderboardType, entry.qualifiesForRating);
  const rankLabel = ratingLeaderboardRankLabel(
    leaderboardType,
    entry.rank,
    entry.qualifiesForRating,
    t('profile.leaderboard.unranked', { defaultValue: '—' }),
  );
  const nameClass = isGrayed
    ? 'text-gray-400 dark:text-gray-500'
    : 'text-gray-900 dark:text-white';
  const rankClass = isCurrentUser && !isGrayed
    ? 'text-primary-600 dark:text-primary-400'
    : isGrayed
      ? 'text-gray-300 dark:text-gray-600'
      : 'text-gray-900 dark:text-white';
  const valueClass = isGrayed
    ? 'text-sm font-medium text-gray-400 dark:text-gray-500'
    : `text-sm font-semibold ${nameClass}`;

  const openProfile = () => {
    openPlayerCard(entry.id);
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openProfile();
    }
  };

  return (
    <tr
      ref={rowRef}
      data-testid="leaderboard-rating-row"
      data-qualifies-for-rating={isGrayed ? 'false' : 'true'}
      role="button"
      tabIndex={0}
      onClick={openProfile}
      onKeyDown={onRowKeyDown}
      className={`cursor-pointer border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
        isInactiveSectionStart ? 'border-t border-t-gray-200 dark:border-t-gray-700' : ''
      } ${
        isCurrentUser
          ? isGrayed
            ? 'bg-gray-50 dark:bg-gray-800/40'
            : 'bg-primary-50 dark:bg-primary-900/20'
          : ''
      }`}
    >
      <td className="px-0 py-2 text-left align-middle">
        <span className={`text-xs font-medium tabular-nums ${rankClass}`}>
          {rankLabel}
        </span>
      </td>
      <td className="min-w-0 py-2 pl-0 pr-2 align-middle">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center">
            <PlayerAvatar
              player={entry}
              extrasmall={true}
              showName={false}
              fullHideName={true}
              asDiv={true}
            />
          </div>
          <div className="min-w-0 w-full flex-1">
            <div className={`line-clamp-2 min-w-0 break-words text-xs ${nameClass}`}>
              {[entry.firstName, entry.lastName].filter(Boolean).join(' ')}
              {isCurrentUser && (
                <span className={`ml-1.5 text-[10px] ${
                  isGrayed
                    ? 'text-gray-400 dark:text-gray-500'
                    : 'text-primary-600 dark:text-primary-400'
                }`}>
                  ({t('profile.you')})
                </span>
              )}
            </div>
            {entry.verbalStatus && (
              <p className="verbal-status line-clamp-2 break-words">
                {entry.verbalStatus}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap py-2 pl-2 pr-0 text-right align-middle">
        <div className="flex items-center justify-end gap-1">
          {entry.lastGameRatingChange !== null &&
            entry.lastGameRatingChange !== undefined && (
              <span className={ratingLeaderboardDeltaClass(entry.lastGameRatingChange, isGrayed)}>
                {formatRatingDelta(entry.lastGameRatingChange)}
              </span>
            )}
          <span className={valueClass}>
            {displayValue}
          </span>
        </div>
      </td>
    </tr>
  );
}
