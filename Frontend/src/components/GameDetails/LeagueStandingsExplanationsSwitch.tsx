import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ToggleSwitch';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function LeagueStandingsExplanationsSwitch({ checked, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/40">
      <div className="min-w-0">
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {t('gameDetails.standingsShowExplanations')}
        </span>
        <p className="m-0 mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
          {t('gameDetails.standingsShowExplanationsHint')}
        </p>
      </div>
      <ToggleSwitch
        checked={checked}
        onChange={onChange}
        id="league-standings-explanations"
      />
    </div>
  );
}
