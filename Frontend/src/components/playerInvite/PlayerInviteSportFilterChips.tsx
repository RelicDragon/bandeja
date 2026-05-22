import { useTranslation } from 'react-i18next';
import type { Sport } from '@/sport/sportRegistry';
import { getSportConfig } from '@/sport/sportRegistry';
import type { InviteSportFilterValue } from '@/utils/inviteSportFilter';

interface PlayerInviteSportFilterChipsProps {
  gameSport: Sport;
  extraSports: Sport[];
  filter: InviteSportFilterValue;
  onChange: (value: InviteSportFilterValue) => void;
}

export function PlayerInviteSportFilterChips({
  gameSport,
  extraSports,
  filter,
  onChange,
}: PlayerInviteSportFilterChipsProps) {
  const { t } = useTranslation();

  const chipClass = (active: boolean) =>
    `inline-flex items-center gap-1 shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
      active
        ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
    }`;

  const isActive = (value: InviteSportFilterValue) => filter === value;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t('sportFilter.section')}
      </p>
      <div className="flex flex-wrap gap-2 py-0.5 pr-0.5">
        <button type="button" onClick={() => onChange('all')} className={chipClass(isActive('all'))}>
          {t('sportFilter.allSports')}
        </button>
        <button type="button" onClick={() => onChange('game')} className={chipClass(isActive('game'))}>
          <span aria-hidden>{getSportConfig(gameSport).icon}</span>
          {t(getSportConfig(gameSport).labelKey)}
        </button>
        {extraSports.map((sportId) => (
          <button
            key={sportId}
            type="button"
            onClick={() => onChange(sportId)}
            className={chipClass(isActive(sportId))}
          >
            <span aria-hidden>{getSportConfig(sportId).icon}</span>
            {t(getSportConfig(sportId).labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
