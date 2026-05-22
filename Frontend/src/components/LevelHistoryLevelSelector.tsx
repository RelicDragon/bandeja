import { useTranslation } from 'react-i18next';
import type { Sport } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { SocialLevelIcon } from '@/components/profile/SocialLevelIcon';

export type LevelHistorySelection =
  | { kind: 'competitive'; sport: Sport }
  | { kind: 'social' };

type LevelHistoryLevelSelectorProps = {
  sports: Sport[];
  value: LevelHistorySelection;
  onChange: (value: LevelHistorySelection) => void;
  embedded?: boolean;
  tone?: 'neutral' | 'onGradient';
};

export function LevelHistoryLevelSelector({
  sports,
  value,
  onChange,
  embedded = false,
  tone = 'neutral',
}: LevelHistoryLevelSelectorProps) {
  const { t } = useTranslation();

  if (sports.length === 0) {
    return null;
  }

  const chipClass = (active: boolean) => {
    if (tone === 'onGradient') {
      return `flex min-w-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 transition-all sm:min-w-[3.5rem] ${
        active
          ? 'bg-white text-gray-900 shadow-sm'
          : 'text-white/90 hover:text-white hover:bg-white/15'
      }`;
    }
    return `flex min-w-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 transition-all sm:min-w-[3.5rem] ${
      active
        ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
    }`;
  };

  const trackClass = embedded
    ? tone === 'onGradient'
      ? 'flex flex-wrap gap-2 p-2 pb-0'
      : 'flex flex-wrap gap-2 p-1.5 pb-0 border-b border-gray-200/60 dark:border-gray-600/50'
    : 'flex flex-wrap gap-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-800';

  const innerTrackClass =
    embedded && tone === 'onGradient'
      ? 'flex flex-wrap gap-2 rounded-lg bg-black/15 p-1'
      : embedded
        ? 'flex flex-wrap gap-2 rounded-lg bg-gray-200/70 p-1 dark:bg-gray-800/80'
        : '';

  return (
    <div
      className={trackClass}
      role="radiogroup"
      aria-label={t('playerCard.levelHistorySelector')}
    >
      <div className={innerTrackClass || 'contents'}>
      {sports.map((sport) => {
        const active = value.kind === 'competitive' && value.sport === sport;
        const config = getSportConfig(sport);
        return (
          <button
            key={sport}
            type="button"
            role="radio"
            aria-checked={active}
            title={t(config.labelKey)}
            onClick={() => onChange({ kind: 'competitive', sport })}
            className={chipClass(active)}
          >
            <SportPublicIcon sport={sport} className="h-5 w-5 shrink-0 object-contain" />
            <span className="sr-only sm:not-sr-only sm:text-xs sm:font-semibold">
              {t(config.labelKey)}
            </span>
          </button>
        );
      })}
      <button
          type="button"
          role="radio"
          aria-checked={value.kind === 'social'}
          title={t('rating.socialLevel')}
          onClick={() => onChange({ kind: 'social' })}
          className={chipClass(value.kind === 'social')}
        >
          <SocialLevelIcon size={20} />
          <span className="sr-only sm:not-sr-only sm:text-xs sm:font-semibold">
            {t('rating.socialLevel')}
          </span>
        </button>
      </div>
    </div>
  );
}
