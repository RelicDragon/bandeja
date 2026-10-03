import { useTranslation } from 'react-i18next';
import { Wallet } from 'lucide-react';
import type { RosterFilter } from './rosterModel';

const LABEL_KEY: Record<RosterFilter, string> = {
  ALL: 'common.all',
  CONFIRMED: 'attendance.dots.confirmed',
  UNSURE: 'attendance.dots.unsure',
  UNANSWERED: 'attendance.dots.unanswered',
  UNPAID: 'cost.state.unpaid',
  SETTLED: 'cost.state.settled',
};

/** Big rosters only. Money chips (dashed, wallet icon) exist only for collectors. */
export function RosterFilterChips({
  filters,
  active,
  onChange,
}: {
  filters: { filter: RosterFilter; count: number }[];
  active: RosterFilter;
  onChange: (filter: RosterFilter) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="toolbar"
      aria-label={t('attendance.roster.filterLabel')}
      className="-mx-3 mt-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 sm:-mx-4 sm:px-4 [&::-webkit-scrollbar]:hidden"
    >
      {filters.map(({ filter, count }) => {
        const on = filter === active;
        const money = filter === 'UNPAID' || filter === 'SETTLED';
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on && filter !== 'ALL' ? 'ALL' : filter)}
            className={`flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors ${
              on
                ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/25 dark:bg-primary-500'
                : money
                  ? 'border border-dashed border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
            }`}
          >
            {money ? <Wallet size={12} aria-hidden className={on ? '' : 'text-gray-400'} /> : null}
            {t(LABEL_KEY[filter])}
            <span className={`tabular-nums ${on ? 'text-white/80' : 'text-gray-400 dark:text-gray-500'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
