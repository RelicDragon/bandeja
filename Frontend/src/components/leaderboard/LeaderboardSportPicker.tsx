import { useTranslation } from 'react-i18next';
import type { Sport } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';

type LeaderboardSportPickerProps = {
  sports: Sport[];
  value: Sport;
  onChange: (sport: Sport) => void;
};

export const LeaderboardSportPicker = ({ sports, value, onChange }: LeaderboardSportPickerProps) => {
  const { t } = useTranslation();

  if (sports.length <= 1) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl p-1"
      role="group"
      aria-label={t('profile.leaderboard.sportLabel')}
    >
      {sports.map((sport) => {
        const active = sport === value;
        const config = getSportConfig(sport);
        return (
          <button
            key={sport}
            type="button"
            onClick={() => onChange(sport)}
            className={`flex-1 min-w-[4.5rem] px-3 py-2 rounded-lg font-semibold text-sm transition-all duration-300 ease-in-out ${
              active
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {t(config.labelKey)}
          </button>
        );
      })}
    </div>
  );
};
