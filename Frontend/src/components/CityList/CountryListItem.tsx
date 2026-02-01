import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { getCountryFlag } from '@/utils/countryFlag';
import type { CountryWithClubs } from '@/hooks/useCityList';

export interface CountryListItemProps {
  item: CountryWithClubs;
  isSelected: boolean;
  onSelect: (country: string) => void;
  className?: string;
}

function CountryListItemInner({ item, isSelected, onSelect, className = '' }: CountryListItemProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onSelect(item.country)}
      className={`w-full min-w-0 text-left flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-colors ${
        isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-2 ring-primary-400/50 ring-offset-2 dark:ring-offset-gray-900'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50/50 dark:hover:bg-gray-800/50'
      } ${className}`}
    >
      <span className="flex items-center gap-2 font-medium text-sm text-gray-900 dark:text-white min-w-0 overflow-hidden">
        <span className="text-lg leading-none shrink-0">{getCountryFlag(item.country)}</span>
        <span className="truncate">{item.country}</span>
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
        {t('city.clubsCount', { count: item.clubsCount })}
      </span>
    </button>
  );
}

export const CountryListItem = memo(CountryListItemInner, (prev, next) =>
  prev.item.country === next.item.country &&
  prev.item.clubsCount === next.item.clubsCount &&
  prev.isSelected === next.isSelected &&
  prev.onSelect === next.onSelect
);
