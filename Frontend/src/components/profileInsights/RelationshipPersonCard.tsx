import { useTranslation } from 'react-i18next';
import type { PerformanceRelationshipEntry } from '@/api/users';
import {
  formatRatingNetChange,
  getInitials,
  getPlayerName,
  getRatingNetChangeClass,
} from '@/components/profileInsights/relationshipDisplay';

interface RelationshipPersonCardProps {
  entry: PerformanceRelationshipEntry;
}

export function RelationshipPersonCard({ entry }: RelationshipPersonCardProps) {
  const { t } = useTranslation();
  const fallbackName = t('playerCard.shareProfileFallbackName');
  const playerName = getPlayerName(entry, fallbackName);
  const ratingNetChange = formatRatingNetChange(entry.ratingNetChange);

  return (
    <div className="rounded-xl border border-gray-200/70 bg-white/70 p-3 shadow-sm dark:border-gray-700/70 dark:bg-gray-800/45">
      <div className="flex min-w-0 items-center gap-3">
        {entry.user.avatar ? (
          <img
            src={entry.user.avatar}
            alt={playerName}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
            {getInitials(entry)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {playerName}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs tabular-nums text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-green-600 dark:text-green-400">
              {entry.wins}{t('playerCard.winsShort')}
            </span>
            <span className="font-semibold text-red-600 dark:text-red-400">
              {entry.losses}{t('playerCard.lossesShort')}
            </span>
            <span className="font-semibold text-yellow-600 dark:text-yellow-400">
              {entry.ties}{t('playerCard.tiesShort')}
            </span>
            <span className="text-gray-400 dark:text-gray-500">·</span>
            <span>{entry.winRate}%</span>
            <span className="text-gray-400 dark:text-gray-500">·</span>
            <span
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none ring-1 ${getRatingNetChangeClass(entry.ratingNetChange)}`}
              title={t('playerCard.relationshipRatingNetChange', { change: ratingNetChange })}
              aria-label={t('playerCard.relationshipRatingNetChange', { change: ratingNetChange })}
            >
              Δ {ratingNetChange}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
