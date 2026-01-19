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
}

export const CityModal = ({ isOpen, onClose }: CityModalProps) => {
  const { t } = useTranslation();
  const updateUser = useAuthStore((state) => state.updateUser);
  const user = useAuthStore((state) => state.user);

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
          setError(t('errors.generic'));
        } finally {
          setLoading(false);
        }
      };
      fetchCities();
    }
  }, [isOpen, t]);

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

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isBasic
      modalId="city-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
      >
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 p-4">
          {t('profile.changeCity')}
        </h3>
        
        <div className="px-4 max-h-96 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          </div>
        ) : (
          <div className="space-y-2">
            {cities.map((city) => (
              <button
                key={city.id}
                onClick={() => handleChangeCity(city.id)}
                disabled={submitting}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  city.id === user?.currentCity?.id
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                } ${submitting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="font-medium text-gray-900 dark:text-white">
                  {city.name}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {city.country}
                </div>
              </button>
            ))}
          </div>
          )}
        </div>

        <Button
          variant="secondary"
          onClick={onClose}
          className="w-full mt-4 mx-4 mb-4"
          disabled={submitting}
        >
          {t('common.cancel')}
        </Button>
    </BaseModal>
  );
};
