import { useTranslation } from 'react-i18next';
import type { Sport } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';

type Props = {
  sports: Sport[];
  onPick: (sport: Sport) => void;
  onCancel: () => void;
};

export function CreateGameSportPicker({ sports, onPick, onCancel }: Props) {
  const { t } = useTranslation();

  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-900"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="mb-2 px-1 text-xs font-medium text-gray-600 dark:text-gray-400">
        {t('createGame.pickSport', { defaultValue: 'Choose sport' })}
      </p>
      <div className="flex flex-col gap-1.5">
        {sports.map((sport) => {
          const cfg = getSportConfig(sport);
          return (
            <button
              key={sport}
              type="button"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-primary-50 dark:text-gray-100 dark:hover:bg-primary-900/30"
              onClick={() => onPick(sport)}
            >
              <SportPublicIcon sport={sport} className="h-6 w-6 shrink-0 object-contain" />
              {t(cfg.labelKey)}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="mt-2 w-full rounded-lg py-1.5 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        onClick={onCancel}
      >
        {t('common.cancel', { defaultValue: 'Cancel' })}
      </button>
    </div>
  );
}
