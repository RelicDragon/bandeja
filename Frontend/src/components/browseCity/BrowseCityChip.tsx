import { ChevronDown, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type BrowseCityChipProps = {
  cityName: string;
  isAway?: boolean;
  onClick: () => void;
  size?: 'bar' | 'field';
  disabled?: boolean;
  testId?: string;
  ariaHome?: string;
  ariaAway?: string;
};

export function BrowseCityChip({
  cityName,
  isAway = false,
  onClick,
  size = 'bar',
  disabled = false,
  testId = 'browse-city-chip',
  ariaHome,
  ariaAway,
}: BrowseCityChipProps) {
  const { t } = useTranslation();
  const label = isAway
    ? ariaAway ?? t('browseCity.chipAriaAway', { city: cityName })
    : ariaHome ?? t('browseCity.chipAriaHome', { city: cityName });
  const field = size === 'field';

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled || !cityName}
      title={cityName}
      aria-label={label}
      className={
        field
          ? `inline-flex max-w-[7.5rem] shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[12px] font-semibold leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.98] ${
              isAway
                ? 'bg-primary-500 text-white shadow-sm shadow-primary-500/25'
                : 'bg-gray-100/90 text-gray-700 ring-1 ring-gray-200/80 dark:bg-gray-800/90 dark:text-gray-200 dark:ring-gray-700'
            } disabled:opacity-40`
          : `inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.98] ${
              isAway
                ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-950/50 dark:text-primary-300 dark:ring-primary-800'
                : 'bg-gray-100 text-gray-700 ring-1 ring-gray-200/70 dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700'
            } disabled:opacity-40`
      }
    >
      <MapPin className={field ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} strokeWidth={2.25} />
      <span className="min-w-0 truncate">{cityName || t('browseCity.changeCity')}</span>
      <ChevronDown className={field ? 'h-3 w-3 shrink-0 opacity-70' : 'h-3.5 w-3.5 shrink-0 opacity-70'} />
    </button>
  );
}
