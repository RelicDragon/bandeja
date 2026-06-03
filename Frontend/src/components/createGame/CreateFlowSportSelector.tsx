import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import type { Sport } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';

type CreateFlowSportSelectorProps = {
  sports: Sport[];
  value: Sport;
  onChange: (sport: Sport) => void;
  showLabel?: boolean;
  defaultSport?: Sport;
};

export function CreateFlowSportSelector({
  sports,
  value,
  onChange,
  showLabel = true,
  defaultSport,
}: CreateFlowSportSelectorProps) {
  const { t } = useTranslation();
  const title = t('sport.sport', { defaultValue: 'Sport' });

  if (sports.length <= 1) {
    return null;
  }

  const sortedSports = defaultSport
    ? [...sports].sort((a, b) => {
        if (a === defaultSport) return -1;
        if (b === defaultSport) return 1;
        return 0;
      })
    : sports;

  return (
    <div>
      {showLabel && (
        <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      )}
      <div
        className="flex flex-wrap gap-2 rounded-xl bg-gray-100 p-1 dark:bg-gray-800"
        role="radiogroup"
        aria-label={title}
      >
        {sortedSports.map((sport) => {
          const active = sport === value;
          const config = getSportConfig(sport);
          const isDefaultSport = sport === defaultSport;
          return (
            <button
              key={sport}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(sport)}
              className={`flex min-w-[4.5rem] flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-all sm:text-sm ${
                active
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              <SportPublicIcon sport={sport} className="h-5 w-5 shrink-0 object-contain" />
              {t(config.labelKey)}
              {isDefaultSport && <Star className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
