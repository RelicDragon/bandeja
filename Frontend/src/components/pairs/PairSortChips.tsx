import { memo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PAIR_SORTS, type PairPeriod, type PairSort } from '@/api/pairs';
import { PAIR_PERIODS } from './pairFilters';

const SORT_LABEL_KEY: Record<PairSort, string> = {
  winRate: 'pairs.sort.winRate',
  games: 'pairs.sort.games',
  level: 'pairs.sort.level',
};

const PERIOD_LABEL_KEY: Record<PairPeriod, string> = {
  all: 'pairs.period.all',
  '30': 'pairs.period.days30',
  '10': 'pairs.period.days10',
};

interface ChoiceChipsProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  labelOf: (option: T) => string;
  testId: string;
  className?: string;
}

/**
 * Chips as a real radio group: one tab stop, arrow keys move **and** select
 * (the ARIA practice for radio groups), Home/End jump to the ends. Arrow
 * direction is resolved against the document direction so `ar` moves the way
 * the row actually reads.
 */
function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
  labelOf,
  testId,
  className = '',
}: ChoiceChipsProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);

  const focusIndex = useCallback((index: number) => {
    const chips = containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    chips?.[index]?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const rtl = document.documentElement.dir === 'rtl';
      const index = options.indexOf(value);
      let next = index;

      if (event.key === 'ArrowRight') next = rtl ? index - 1 : index + 1;
      else if (event.key === 'ArrowLeft') next = rtl ? index + 1 : index - 1;
      else if (event.key === 'ArrowDown') next = index + 1;
      else if (event.key === 'ArrowUp') next = index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = options.length - 1;
      else return;

      event.preventDefault();
      const wrapped = (next + options.length) % options.length;
      const target = options[wrapped];
      if (!target) return;
      onChange(target);
      focusIndex(wrapped);
    },
    [focusIndex, onChange, options, value],
  );

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={`flex flex-wrap items-center gap-2 ${className}`.trim()}
      data-testid={testId}
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option)}
            className={`min-h-[2.75rem] rounded-full px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              active
                ? 'bg-primary-600 text-white dark:bg-primary-500'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {labelOf(option)}
          </button>
        );
      })}
    </div>
  );
}

export interface PairSortChipsProps {
  value: PairSort;
  onChange: (next: PairSort) => void;
  className?: string;
}

export const PairSortChips = memo(({ value, onChange, className }: PairSortChipsProps) => {
  const { t } = useTranslation();
  return (
    <ChoiceChips
      options={PAIR_SORTS}
      value={value}
      onChange={onChange}
      label={t('pairs.sort.label')}
      labelOf={(option) => t(SORT_LABEL_KEY[option])}
      testId="pair-sort-chips"
      className={className}
    />
  );
});

PairSortChips.displayName = 'PairSortChips';

export interface PairPeriodChipsProps {
  value: PairPeriod;
  onChange: (next: PairPeriod) => void;
  className?: string;
}

export const PairPeriodChips = memo(({ value, onChange, className }: PairPeriodChipsProps) => {
  const { t } = useTranslation();
  return (
    <ChoiceChips
      options={PAIR_PERIODS}
      value={value}
      onChange={onChange}
      label={t('pairs.period.label')}
      labelOf={(option) => t(PERIOD_LABEL_KEY[option])}
      testId="pair-period-chips"
      className={className}
    />
  );
});

PairPeriodChips.displayName = 'PairPeriodChips';
