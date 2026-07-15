import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigation } from 'lucide-react';
import { useGeoReady } from '@/hooks/useGeoReady';
import { getCityDisplayName, getCityNativeName } from '@/utils/geoTranslations';
import type { City } from '@/types';
import {
  CITY_SELECTOR_CHECK,
  CITY_SELECTOR_ROW_PAD,
  citySelectorRowClassName,
} from '@/components/CityList/citySelectorRowStyles';

export interface CityListItemProps {
  city: City;
  isSelected: boolean;
  isNearest: boolean;
  isScrollTarget: boolean;
  submitting: boolean;
  isSelectorMode: boolean;
  selectedCityRef: React.RefObject<HTMLButtonElement | null>;
  scrollTargetRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (cityId: string) => void;
  className?: string;
}

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

function shouldShowAdminSubtitle(city: City, displayName: string): string | null {
  const parts = [city.administrativeArea, city.subAdministrativeArea]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p);
  if (parts.length === 0) return null;
  const cityKey = normalizeLabel(city.name);
  const displayKey = normalizeLabel(displayName);
  const meaningful = parts.filter((p) => {
    const key = normalizeLabel(p);
    return key !== cityKey && key !== displayKey;
  });
  if (meaningful.length === 0) return null;
  return meaningful.join(' · ');
}

function CityListItemInner({
  city,
  isSelected,
  isNearest,
  isScrollTarget,
  submitting,
  isSelectorMode,
  selectedCityRef,
  scrollTargetRef,
  onSelect,
  className = '',
}: CityListItemProps) {
  const { t, i18n } = useTranslation();
  useGeoReady();
  const displayName = getCityDisplayName(city.id, city.name, city.country, i18n.language);
  const nativeName = getCityNativeName(city.id, city.name, city.country);
  const showNative = nativeName && nativeName !== displayName;
  const adminSubtitle = shouldShowAdminSubtitle(city, displayName);
  const clubsCount = city.clubsCount ?? 0;
  const ref = isScrollTarget ? scrollTargetRef : isSelected ? selectedCityRef : undefined;

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onSelect(city.id)}
      disabled={submitting && !isSelectorMode}
      aria-label={isNearest ? `${displayName}, ${t('city.nearestToYou')}` : undefined}
      aria-pressed={isSelected}
      className={`${citySelectorRowClassName(isSelected, CITY_SELECTOR_ROW_PAD)} ${
        submitting && !isSelectorMode ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {isNearest && (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-primary-400"
            title={t('city.nearestToYou')}
          >
            <Navigation className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5 min-w-0">
            <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{displayName}</span>
            {showNative && (
              <span className="truncate text-xs font-normal text-gray-500 dark:text-gray-400">{nativeName}</span>
            )}
          </span>
          {adminSubtitle && (
            <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{adminSubtitle}</span>
          )}
        </span>
        <span className="shrink-0 tabular-nums text-xs text-gray-400 dark:text-gray-500">
          {t('city.clubsCount', { count: clubsCount })}
        </span>
        {isSelected && (
          <span className={CITY_SELECTOR_CHECK} aria-hidden>
            ✓
          </span>
        )}
      </div>
    </button>
  );
}

export const CityListItem = memo(CityListItemInner, (prev, next) =>
  prev.city.id === next.city.id &&
  prev.city.name === next.city.name &&
  prev.city.clubsCount === next.city.clubsCount &&
  prev.city.administrativeArea === next.city.administrativeArea &&
  prev.city.subAdministrativeArea === next.city.subAdministrativeArea &&
  prev.isSelected === next.isSelected &&
  prev.isNearest === next.isNearest &&
  prev.isScrollTarget === next.isScrollTarget &&
  prev.submitting === next.submitting &&
  prev.isSelectorMode === next.isSelectorMode &&
  prev.onSelect === next.onSelect
);
