import { memo } from 'react';
import { useTranslation } from 'react-i18next';

export type UnifiedSearchSection = 'cities' | 'clubs' | 'countries';

const SECTION_KEYS: Record<UnifiedSearchSection, string> = {
  cities: 'city.searchSectionCities',
  clubs: 'city.searchSectionClubs',
  countries: 'city.searchSectionCountries',
};

export const UnifiedSearchSectionHeader = memo(function UnifiedSearchSectionHeader({
  section,
}: {
  section: UnifiedSearchSection;
}) {
  const { t } = useTranslation();
  return (
    <div className="px-1 pt-3 pb-1 first:pt-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {t(SECTION_KEYS[section])}
      </span>
    </div>
  );
});
