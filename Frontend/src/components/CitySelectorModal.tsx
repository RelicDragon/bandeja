import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { citiesApi } from '@/api';
import { City } from '@/types';
import { BaseModal } from '@/components/BaseModal';

interface CitySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedId?: string;
  onSelect: (id: string) => void;
}

export const CitySelectorModal = ({ isOpen, onClose, selectedId, onSelect }: CitySelectorModalProps) => {
  const { t } = useTranslation();
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchCities = async () => {
        setLoading(true);
        try {
          const response = await citiesApi.getAll();
          setCities(response.data);
        } catch (err) {
          console.error('Failed to fetch cities:', err);
        } finally {
          setLoading(false);
        }
      };
      fetchCities();
    }
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      isBasic
      modalId="city-selector-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('createLeague.selectCity')}</h3>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            </div>
          ) : cities.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8">{t('createLeague.noCitiesAvailable')}</p>
          ) : (
            <div className="space-y-2">
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
              {cities.map((city) => (
                <button
                  key={city.id}
                  onClick={() => handleSelect(city.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    selectedId === city.id
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className="font-medium">{city.name}</div>
                  <div className="text-sm opacity-80 mt-0.5">{city.country}</div>
                </button>
              ))}
            </div>
          )}
        </div>
    </BaseModal>
  );
};

