import type { KeyboardEvent, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { LeaderboardEntry } from '@/api/ranking';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import {
  RATING_LEADERBOARD_MUTED_TEXT,
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
};

export function StandardLeaderboardRow({
  entry,
  isCurrentUser,
  leaderboardType,
  displayValue,
  formatRatingDelta,
  rowRef,
}: StandardLeaderboardRowProps) {
  const { t } = useTranslation();
  const { openPlayerCard } = usePlayerCardModal();
  const isGrayed = isRatingLeaderboardGrayed(leaderboardType, entry.inactive);
  const rankLabel = ratingLeaderboardRankLabel(
    leaderboardType,
    entry.rank,
    entry.inactive,
    t('profile.leaderboard.unranked', { defaultValue: '—' }),
  );
  const playerName = [entry.firstName, entry.lastName].filter(Boolean).join(' ');
  const nameClass = isGrayed
    ? RATING_LEADERBOARD_MUTED_TEXT
    : 'text-gray-900 dark:text-white';
  const rankClass = isCurrentUser && !isGrayed
    ? 'text-primary-600 dark:text-primary-400'
    : isGrayed
      ? RATING_LEADERBOARD_MUTED_TEXT
      : 'text-gray-900 dark:text-white';
  const valueClass = isGrayed
    ? `text-sm font-medium ${RATING_LEADERBOARD_MUTED_TEXT}`
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
      {...(leaderboardType === 'level'
        ? { 'data-qualifies-for-rating': isGrayed ? 'false' : 'true' }
        : {})}
      role="button"
      tabIndex={0}
      aria-label={
        isGrayed
          ? `${playerName}, ${t('profile.leaderboard.inactiveSection', { defaultValue: 'Not ranked' })}`
          : `${playerName}, ${rankLabel}`
      }
      onClick={openProfile}
      onKeyDown={onRowKeyDown}
      className={`min-h-11 cursor-pointer border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none dark:hover:bg-gray-800/50 dark:focus-visible:bg-gray-800/60 ${
        isCurrentUser
          ? isGrayed
            ? 'bg-gray-50 dark:bg-gray-800/40'
            : 'bg-primary-50 dark:bg-primary-900/20'
          : ''
      }`}
    >
      <td className="px-0 py-2.5 text-left align-middle">
        <span className={`text-xs font-medium tabular-nums ${rankClass}`}>
          {rankLabel}
        </span>
      </td>
      <td className="min-w-0 py-2.5 pl-0 pr-2 align-middle">
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
              {playerName}
              {isCurrentUser && (
                <span className={`ml-1.5 text-[10px] ${
                  isGrayed
                    ? RATING_LEADERBOARD_MUTED_TEXT
                    : 'text-primary-600 dark:text-primary-400'
                }`}>
                  ({t('profile.you')})
                </span>
              )}
            </div>
            {entry.verbalStatus && (
              <p
                className={
                  isGrayed
                    ? `line-clamp-2 break-words text-[9px] -mb-0.5 ${RATING_LEADERBOARD_MUTED_TEXT}`
                    : 'verbal-status line-clamp-2 break-words'
                }
              >
                {entry.verbalStatus}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap py-2.5 pl-2 pr-0 text-right align-middle">
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
