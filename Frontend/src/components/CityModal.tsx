import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './';
import { citiesApi, usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { City } from '@/types';
import { BaseModal } from '@/components/BaseModal';

interface CityModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export const CityModal = ({ isOpen, onClose, selectedId, onSelect }: CityModalProps) => {
  const { t } = useTranslation();
  const updateUser = useAuthStore((state) => state.updateUser);
  const user = useAuthStore((state) => state.user);

  const isSelectorMode = !!onSelect;

  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      const fetchCities = async () => {
        setLoading(true);
        try {
          const response = await citiesApi.getAll();
          setCities(response.data);
        } catch (err) {
          if (isSelectorMode) {
            console.error('Failed to fetch cities:', err);
          } else {
            setError(t('errors.generic'));
          }
        } finally {
          setLoading(false);
        }
      };
      fetchCities();
    }
  }, [isOpen, t, isSelectorMode]);

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
    setError('');

    try {
      const response = await usersApi.switchCity(cityId);
      updateUser(response.data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCityClick = (cityId: string) => {
    if (isSelectorMode) {
      handleSelect(cityId);
    } else {
      handleChangeCity(cityId);
    }
  };

  const currentCityId = isSelectorMode ? selectedId : user?.currentCity?.id;
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
      {isSelectorMode ? (
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
      ) : (
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 p-4">
          {title}
        </h3>
      )}

      <div className={isSelectorMode ? 'overflow-y-auto flex-1 p-4' : 'px-4 max-h-96 overflow-y-auto'}>
        {error && !isSelectorMode && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : cities.length === 0 && isSelectorMode ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('createLeague.noCitiesAvailable')}</p>
        ) : (
          <div className="space-y-2">
            {isSelectorMode && (
              <button
                onClick={() => handleSelect('')}
                className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                  !selectedId
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <div className="font-medium">{t('createLeague.noCity')}</div>
              </button>
            )}
            {cities.map((city) => (
              <button
                key={city.id}
                onClick={() => handleCityClick(city.id)}
                disabled={submitting && !isSelectorMode}
                className={
                  isSelectorMode
                    ? `w-full text-left px-4 py-3 rounded-lg transition-all ${
                        selectedId === city.id
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`
                    : `w-full text-left p-3 rounded-lg border transition-colors ${
                        city.id === currentCityId
                          ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      } ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`
                }
              >
                <div className={isSelectorMode ? 'font-medium' : 'font-medium text-gray-900 dark:text-white'}>
                  {city.name}
                </div>
                <div className={isSelectorMode ? 'text-sm opacity-80 mt-0.5' : 'text-sm text-gray-600 dark:text-gray-400'}>
                  {city.country}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {!isSelectorMode && (
        <Button
          variant="secondary"
          onClick={onClose}
          className="w-full mt-4 mx-4 mb-4"
          disabled={submitting}
        >
          {t('common.cancel')}
        </Button>
      )}
    </BaseModal>
  );
};
