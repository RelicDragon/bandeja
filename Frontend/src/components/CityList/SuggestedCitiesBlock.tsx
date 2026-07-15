import { Navigation, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGeoReady } from '@/hooks/useGeoReady';
import { getCityDisplayName, getCityNativeName } from '@/utils/geoTranslations';
import type { SuggestedCityEntry, SuggestedCityKind } from '@/utils/buildSuggestedCityEntries';
import {
  CITY_SELECTOR_CHECK,
  CITY_SELECTOR_ROW_PAD,
  citySelectorRowClassName,
} from '@/components/CityList/citySelectorRowStyles';

export type { SuggestedCityEntry, SuggestedCityKind };

export interface SuggestedCitiesBlockProps {
  entries: SuggestedCityEntry[];
  selectedCityId?: string;
  submitting?: boolean;
  onSelect: (cityId: string) => void;
}

function kindLabel(kind: SuggestedCityKind, t: (key: string) => string): string {
  if (kind === 'both') return t('city.suggestedCurrentNearest');
  if (kind === 'nearest') return t('city.suggestedNearest');
  return t('city.suggestedCurrent');
}

export function SuggestedCitiesBlock({
  entries,
  selectedCityId,
  submitting = false,
  onSelect,
}: SuggestedCitiesBlockProps) {
  const { t, i18n } = useTranslation();
  useGeoReady();

  if (entries.length === 0) return null;

  return (
    <section className="mb-2 space-y-1.5 min-w-0" aria-label={t('city.suggested')}>
      <h3 className="px-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {t('city.suggested')}
      </h3>
      <ul className="m-0 list-none space-y-1 p-0">
        {entries.map(({ city, kind }) => {
          const displayName = getCityDisplayName(city.id, city.name, city.country, i18n.language);
          const nativeName = getCityNativeName(city.id, city.name, city.country);
          const showNative = nativeName && nativeName !== displayName;
          const isSelected = city.id === selectedCityId;
          const Icon = kind === 'current' ? MapPin : Navigation;
          return (
            <li key={`${kind}:${city.id}`}>
              <button
                type="button"
                onClick={() => onSelect(city.id)}
                disabled={submitting}
                aria-label={`${kindLabel(kind, t)}: ${displayName}`}
                className={`${citySelectorRowClassName(isSelected, CITY_SELECTOR_ROW_PAD)} disabled:opacity-50`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Icon
                    className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {displayName}
                      </span>
                      {showNative && (
                        <span className="truncate text-xs font-normal text-gray-500 dark:text-gray-400">
                          {nativeName}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[0.6875rem] font-medium uppercase tracking-wide text-primary-600/80 dark:text-primary-400/85">
                      {kindLabel(kind, t)}
                    </span>
                  </span>
                  {isSelected && (
                    <span className={CITY_SELECTOR_CHECK} aria-hidden>
                      ✓
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
