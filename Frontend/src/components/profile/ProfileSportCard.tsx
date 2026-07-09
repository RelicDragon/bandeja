import { type KeyboardEvent, type MouseEvent } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Sport } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { getSportPublicIcon } from '@/sport/sportPublicIcon';
import { ProfileSportActivityHint } from '@/components/profile/ProfileSportActivityHint';

type ProfileSportCardProps = {
  sport: Sport;
  enabled: boolean;
  isPrimary: boolean;
  showStats: boolean;
  displayLevel: number;
  gamesPlayed: number;
  disabled?: boolean;
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
  onCardClick: () => void;
  onSetPrimary: () => void;
  onPrimaryStarClick: () => void;
  activityRow?: { gamesLast7Days: number; gamesLast30Days: number } | null;
};

export function ProfileSportCard({
  sport,
  enabled,
  isPrimary,
  showStats,
  displayLevel,
  gamesPlayed,
  disabled = false,
  detailsOpen = false,
  onToggleDetails,
  onCardClick,
  onSetPrimary,
  onPrimaryStarClick,
  activityRow,
}: ProfileSportCardProps) {
  const { t } = useTranslation();
  const config = getSportConfig(sport);
  const label = t(config.labelKey);

  const handleStarClick = (e: MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (isPrimary) {
      onPrimaryStarClick();
      return;
    }
    onSetPrimary();
  };

  const handleCardKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCardClick();
    }
  };

  const toggleDetails = (e: MouseEvent) => {
    e.stopPropagation();
    onToggleDetails?.();
  };

  return (
    <div className="relative flex h-full w-full min-w-0 flex-col pt-1 pr-1">
      {enabled && (
        <button
          type="button"
          disabled={disabled}
          aria-label={isPrimary ? t('profile.sports.primarySport') : t('profile.sports.setPrimary')}
          onClick={handleStarClick}
          className={`absolute -right-0.5 -top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-slate-800 dark:shadow-slate-950/40 ${
            disabled ? 'cursor-wait opacity-60' : 'cursor-pointer hover:border-primary-600 dark:hover:border-primary-400'
          } ${
            isPrimary
              ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
              : 'border-gray-300 text-gray-300 dark:border-slate-500 dark:text-slate-500'
          }`}
        >
          <Star size={12} fill={isPrimary ? 'currentColor' : 'none'} aria-hidden />
        </button>
      )}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-pressed={enabled}
        aria-expanded={enabled ? detailsOpen : undefined}
        aria-label={label}
        aria-disabled={disabled}
        onClick={disabled ? undefined : onCardClick}
        onKeyDown={handleCardKeyDown}
        className={`relative flex h-full w-full flex-1 flex-col items-center gap-1 rounded-xl border-2 p-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
          disabled ? 'cursor-wait opacity-60' : 'cursor-pointer'
        } ${
          enabled
            ? detailsOpen
              ? 'border-primary-600 bg-primary-100/90 shadow-md ring-2 ring-primary-400/40 dark:border-primary-300 dark:bg-primary-900/50 dark:ring-primary-500/30'
              : 'border-primary-500 bg-primary-50 shadow-md dark:border-primary-400 dark:bg-primary-900/35 dark:shadow-primary-950/30'
            : 'border-gray-200 bg-gray-50 opacity-60 grayscale hover:opacity-85 dark:border-slate-600 dark:bg-slate-800/55 dark:opacity-90 dark:grayscale-0 dark:hover:bg-slate-800/75'
        }`}
      >
        <img src={getSportPublicIcon(sport)} alt="" className="h-10 w-10 object-contain" draggable={false} />
        <span
          className={`text-center text-[11px] font-semibold leading-tight ${
            enabled ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'
          }`}
        >
          {label}
        </span>
        {enabled && activityRow ? <ProfileSportActivityHint row={activityRow} /> : null}

        {enabled && showStats && (
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">
              {displayLevel.toFixed(1)}
            </span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {t('profile.sports.gamesCount', { count: gamesPlayed })}
            </span>
          </div>
        )}

        {enabled ? (
          <button
            type="button"
            className="mt-auto inline-flex items-center gap-0.5 pt-1 text-[10px] font-medium text-primary-600 dark:text-primary-400"
            onClick={toggleDetails}
          >
            {detailsOpen ? t('profile.sports.hideDetails') : t('profile.sports.showDetails')}
            <ChevronDown
              size={12}
              className={`transition-transform duration-200 ${detailsOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}
