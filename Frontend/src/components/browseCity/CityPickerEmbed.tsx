import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCityList } from '@/hooks/useCityList';
import { CityListContent } from '@/components/CityListContent';
import { useAuthStore } from '@/store/authStore';
import type { City } from '@/types';

type CityPickerEmbedProps = {
  selectedId?: string;
  recentCityIds?: string[];
  onSelect: (id: string, city?: City) => void;
  onClose: () => void;
};

export function CityPickerEmbed({
  selectedId,
  recentCityIds,
  onSelect,
  onClose,
}: CityPickerEmbedProps) {
  const { t } = useTranslation();
  const homeCityId = useAuthStore((s) => s.user?.currentCity?.id ?? s.user?.currentCityId);
  const cityList = useCityList({
    enabled: true,
    currentCityId: homeCityId ?? selectedId,
  });

  return (
    <div className="absolute inset-0 z-30 flex min-h-0 flex-col bg-white dark:bg-gray-900">
      <div className="flex shrink-0 items-center gap-1 px-2 pb-1 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          aria-label={t('common.close')}
        >
          <ChevronLeft size={22} />
        </button>
        <h2 className="min-w-0 flex-1 text-left text-[15px] font-semibold tracking-tight text-gray-900 dark:text-white">
          {t('browseCity.changeCity')}
        </h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <CityListContent
          view={cityList.view}
          search={cityList.search}
          setSearch={cityList.setSearch}
          loading={cityList.loading}
          error={cityList.error}
          filteredCountries={cityList.filteredCountries}
          filteredCitiesForCountry={cityList.filteredCitiesForCountry}
          allCities={cityList.cities}
          selectedCountry={cityList.selectedCountry}
          selectCountry={cityList.selectCountry}
          backToCountries={cityList.backToCountries}
          currentCityId={homeCityId ?? selectedId}
          onCityClick={(id) => {
            onSelect(id, cityList.cities.find((city) => city.id === id));
            onClose();
          }}
          isSelectorMode
          showNoCityOption={false}
          selectedId={selectedId}
          submitting={false}
          showError
          showingLoading={cityList.loading}
          citiesCount={cityList.cities.length}
          recentCityIds={recentCityIds}
        />
      </div>
    </div>
  );
}
