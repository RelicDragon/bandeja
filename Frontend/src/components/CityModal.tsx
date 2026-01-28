import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { BaseModal } from '@/components/BaseModal';
import { useCityList } from '@/hooks/useCityList';
import { CityListContent } from '@/components/CityListContent';

interface CityModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedId?: string;
  onSelect?: (id: string) => void;
  onCityChanged?: () => void;
}

export const CityModal = ({ isOpen, onClose, selectedId, onSelect, onCityChanged }: CityModalProps) => {
  const { t } = useTranslation();
  const updateUser = useAuthStore((state) => state.updateUser);
  const user = useAuthStore((state) => state.user);

  const isSelectorMode = !!onSelect;
  const wasOpenRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const currentCityId = isSelectorMode ? selectedId : (selectedId ?? user?.currentCity?.id);
  const cityList = useCityList({
    enabled: isOpen,
    currentCityId,
    onFetchError: isSelectorMode ? undefined : (setError) => setError(t('errors.generic')),
  });

  useEffect(() => {
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  const justOpened = isOpen && !wasOpenRef.current;
  const showingLoading = cityList.loading || (justOpened && cityList.cities.length > 0);

  const handleSelect = (id: string) => {
    if (onSelect) {
      onSelect(id);
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

  const title = isSelectorMode ? t('createLeague.selectCity') : t('profile.changeCity');
  const modalId = isSelectorMode ? 'city-selector-modal' : 'city-modal';

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isBasic
      modalId={modalId}
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
      <div className="flex flex-col min-h-0 h-[80vh]">
        {isSelectorMode ? (
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          </div>
        ) : (
          <div className="px-4 pt-2 pb-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          </div>
        )}

        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
          <div className={`flex flex-col flex-1 min-h-0 overflow-hidden ${isSelectorMode ? 'p-0' : 'px-0'}`}>
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
              currentCityId={currentCityId}
              onCityClick={handleCityClick}
              isSelectorMode={isSelectorMode}
              showNoCityOption={isSelectorMode}
              selectedId={selectedId}
              submitting={submitting}
              showError={!isSelectorMode}
              showingLoading={showingLoading}
              citiesCount={cityList.cities.length}
            />
          </div>

          {!isSelectorMode && (
            <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50/50 dark:bg-gray-800/30">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="w-full py-2.5 px-4 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      </div>
    </BaseModal>
  );
};
