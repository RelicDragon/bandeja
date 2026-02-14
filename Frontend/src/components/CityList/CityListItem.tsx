import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigation } from 'lucide-react';
import { useGeoReady } from '@/hooks/useGeoReady';
import { getCityDisplayName, getCityNativeName } from '@/utils/geoTranslations';
import type { City } from '@/types';

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
  const ref = isScrollTarget ? scrollTargetRef : isSelected ? selectedCityRef : undefined;
  return (
    <button
      ref={ref}
      onClick={() => onSelect(city.id)}
      disabled={submitting && !isSelectorMode}
      aria-label={isNearest ? `${displayName}, ${t('city.nearestToYou')}` : undefined}
      className={
        isSelectorMode
          ? `w-full min-w-0 text-left px-4 py-3 rounded-xl transition-all ${
              isSelected
                ? 'bg-primary-500 text-white ring-2 ring-primary-400 ring-offset-2 dark:ring-offset-gray-900'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
            } ${className}`
          : `w-full min-w-0 text-left p-3 rounded-xl border transition-colors ${
              isSelected
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 ring-2 ring-primary-400/50 ring-offset-2 dark:ring-offset-gray-900'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50/50 dark:hover:bg-gray-800/50'
            } ${submitting ? 'opacity-50 cursor-not-allowed' : ''} ${className}`
      }
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="flex items-center gap-2 min-w-0">
          {isNearest && (
            <span
              className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400"
              title={t('city.nearestToYou')}
            >
              <Navigation className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
            </span>
          )}
          <span className="font-medium text-gray-900 dark:text-white text-sm truncate">
            {displayName}
            {showNative && (
              <span className="text-gray-500 dark:text-gray-400 font-normal ml-1 text-xs">{nativeName}</span>
            )}
          </span>
        </span>
        {isSelected && (
          <span
            className={`shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-xs ${isSelectorMode ? 'bg-white/20 text-white' : 'bg-primary-500 text-white'}`}
            aria-hidden
          >
            ✓
          </span>
        )}
      </div>
      {(city.administrativeArea || city.subAdministrativeArea) && (
        <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 truncate">
          {[city.administrativeArea, city.subAdministrativeArea].filter(Boolean).join(' · ')}
        </div>
      )}
      <div className="mt-1.5 flex justify-end">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {t('city.clubsCount', { count: city.clubsCount ?? 0 })}
        </span>
      </div>
    </button>
  );
}

export const CityListItem = memo(CityListItemInner, (prev, next) =>
  prev.city.id === next.city.id &&
  prev.city.name === next.city.name &&
  prev.city.clubsCount === next.city.clubsCount &&
  prev.isSelected === next.isSelected &&
  prev.isNearest === next.isNearest &&
  prev.isScrollTarget === next.isScrollTarget &&
  prev.submitting === next.submitting &&
  prev.isSelectorMode === next.isSelectorMode &&
  prev.onSelect === next.onSelect
);
