import type { KeyboardEvent, MouseEvent } from 'react';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@/components';
import type { Sport, User } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { getSportPublicIcon } from '@/sport/sportPublicIcon';
import { SportQuestionnaireEstimateLink } from '@/components/sportQuestionnaire/SportQuestionnaireEstimateLink';

type ProfileSportCardProps = {
  sport: Sport;
  user: User;
  enabled: boolean;
  isPrimary: boolean;
  showStats: boolean;
  displayLevel: number;
  gamesPlayed: number;
  levelEditable: boolean;
  editing: boolean;
  draftLevel: string;
  disabled?: boolean;
  onDraftLevelChange: (value: string) => void;
  onCardClick: () => void;
  onStartEditLevel: () => void;
  onSaveLevel: () => void;
  onCancelEdit: () => void;
  onSetPrimary: () => void;
  onPrimaryStarClick: () => void;
  onUserUpdated: (user: User) => void;
};

export function ProfileSportCard({
  sport,
  user,
  enabled,
  isPrimary,
  showStats,
  displayLevel,
  gamesPlayed,
  levelEditable,
  editing,
  draftLevel,
  disabled = false,
  onDraftLevelChange,
  onCardClick,
  onStartEditLevel,
  onSaveLevel,
  onCancelEdit,
  onSetPrimary,
  onPrimaryStarClick,
  onUserUpdated,
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

  return (
    <div className="relative pt-1 pr-1">
      {enabled && (
        <button
          type="button"
          disabled={disabled}
          aria-label={isPrimary ? t('profile.sports.primarySport') : t('profile.sports.setPrimary')}
          onClick={handleStarClick}
          className={`absolute -right-0.5 -top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-gray-900 ${
            disabled ? 'cursor-wait opacity-60' : 'cursor-pointer hover:border-primary-600 dark:hover:border-primary-400'
          } ${
            isPrimary
              ? 'border-primary-500 text-primary-600 dark:border-primary-400 dark:text-primary-400'
              : 'border-gray-300 text-transparent dark:border-gray-600'
          }`}
        >
          {isPrimary && <Star size={12} fill="currentColor" aria-hidden />}
        </button>
      )}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-pressed={enabled}
        aria-label={label}
        aria-disabled={disabled}
        onClick={disabled ? undefined : onCardClick}
        onKeyDown={handleCardKeyDown}
        className={`relative flex w-full flex-col items-center gap-1 rounded-xl border-2 p-2 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
          disabled ? 'cursor-wait opacity-60' : 'cursor-pointer'
        } ${
          enabled
            ? 'border-primary-500 bg-primary-50 shadow-md dark:border-primary-400 dark:bg-primary-950/40'
            : 'border-gray-200 bg-gray-50 opacity-55 grayscale hover:opacity-80 dark:border-gray-700 dark:bg-gray-800/40'
        }`}
      >
        <img
          src={getSportPublicIcon(sport)}
          alt=""
          className="h-10 w-10 object-contain"
          draggable={false}
        />
        <span
          className={`text-center text-[11px] font-semibold leading-tight ${
            enabled ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {label}
        </span>
        {showStats &&
          (editing ? (
            <div
              className="mt-0.5 flex w-full flex-col items-stretch gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Input
                type="number"
                step="0.1"
                min={1}
                max={7}
                value={draftLevel}
                onChange={(e) => onDraftLevelChange(e.target.value)}
                className="h-7 px-1.5 text-center text-xs"
              />
              <div className="flex gap-1">
                <Button size="sm" className="flex-1 text-[10px] px-1" onClick={onSaveLevel} disabled={disabled}>
                  {t('profile.save')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 text-[10px] px-1"
                  onClick={onCancelEdit}
                >
                  {t('profile.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-0.5 flex flex-col items-center gap-0.5">
              <div className="flex items-baseline gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (levelEditable) onStartEditLevel();
                  }}
                  className={`text-xs font-semibold text-yellow-600 dark:text-yellow-400 ${
                    levelEditable ? 'underline-offset-2 hover:underline' : ''
                  }`}
                  disabled={!levelEditable}
                >
                  {displayLevel.toFixed(1)}
                </button>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                  {t('profile.sports.gamesCount', { count: gamesPlayed })}
                </span>
              </div>
              <SportQuestionnaireEstimateLink
                user={user}
                sport={sport}
                onUserUpdated={onUserUpdated}
                className="text-[10px]"
              />
            </div>
          ))}
      </div>
    </div>
  );
}
