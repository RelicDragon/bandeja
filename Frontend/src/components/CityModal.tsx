import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerHandle,
} from '@/components/ui/Drawer';
import { useCityList } from '@/hooks/useCityList';
import { CityListContent } from '@/components/CityListContent';
import {
  CITY_SELECTOR_SHEET_BODY_CLASS,
  CITY_SELECTOR_SHEET_CLASS,
} from '@/components/CityList/citySelectorSheet';
import type { City } from '@/types';

interface CityModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedId?: string;
  onSelect?: (id: string, city?: City) => void;
  onCityChanged?: () => void;
  showNoCityOption?: boolean;
  recentCityIds?: string[];
}

export const CityModal = ({ isOpen, onClose, selectedId, onSelect, onCityChanged, showNoCityOption, recentCityIds }: CityModalProps) => {
  const { t } = useTranslation();
  const updateUser = useAuthStore((state) => state.updateUser);
  const user = useAuthStore((state) => state.user);

  const isSelectorMode = !!onSelect;
  const wasOpenRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const homeCityId = user?.currentCity?.id;
  const currentCityId = isSelectorMode ? selectedId : (selectedId ?? homeCityId);
  const cityList = useCityList({
    enabled: isOpen,
    currentCityId,
    onFetchError: isSelectorMode ? undefined : (setError) => setError(t('errors.generic')),
  });

  const title = isSelectorMode ? t('createLeague.selectCity') : t('profile.changeCity');
  const modalId = isSelectorMode ? 'city-selector-modal' : 'city-modal';

  useBackButtonModal(isOpen, onClose, modalId);

  useEffect(() => {
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  const justOpened = isOpen && !wasOpenRef.current;
  const showingLoading = cityList.loading || (justOpened && cityList.cities.length > 0);

  const handleSelect = (id: string) => {
    if (onSelect) {
      onSelect(id, cityList.cities.find((city) => city.id === id));
      onClose();
    }
  };

  const handleChangeCity = async (cityId: string) => {
    if (cityId === user?.currentCity?.id) {
      onClose();
      return;
    }
    setSubmitting(true);
    cityList.setError('');
    try {
      const response = await usersApi.switchCity(cityId);
      updateUser(response.data);
      onCityChanged?.();
      onClose();
    } catch (err: any) {
      cityList.setError(err.response?.data?.message || t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCityClick = (cityId: string) => {
    if (isSelectorMode) handleSelect(cityId);
    else handleChangeCity(cityId);
  };

  return (
    <Drawer
      open={isOpen}
      handleOnly
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DrawerContent
        className={`${CITY_SELECTOR_SHEET_CLASS} !mt-10 flex flex-col overflow-hidden bg-white dark:bg-gray-900`}
        aria-labelledby={`${modalId}-title`}
      >
        <DrawerHandle className="relative mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300/90 dark:bg-gray-600" />
        <div data-overlay-chrome="" className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-3">
          <h2
            id={`${modalId}-title`}
            className="min-w-0 flex-1 text-start text-lg font-semibold tracking-tight text-gray-900 dark:text-white"
          >
            {title}
          </h2>
          <DrawerCloseButton aria-label={t('common.close')} className="shrink-0" />
        </div>

        <div className={`${CITY_SELECTOR_SHEET_BODY_CLASS} flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]`}>
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
            currentCityId={homeCityId ?? currentCityId}
            onCityClick={handleCityClick}
            isSelectorMode={isSelectorMode}
            showNoCityOption={showNoCityOption ?? isSelectorMode}
            selectedId={isSelectorMode ? selectedId : homeCityId}
            submitting={submitting}
            showError={true}
            showingLoading={showingLoading}
            citiesCount={cityList.cities.length}
            recentCityIds={recentCityIds}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
};
