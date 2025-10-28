import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button, Loading } from '@/components';
import { citiesApi, usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { City } from '@/types';

export const SelectCity = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updateUser = useAuthStore((state) => state.updateUser);

  const [cities, setCities] = useState<City[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCities = async () => {
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
  }, [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCity) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await usersApi.switchCity(selectedCity);
      updateUser(response.data);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-white">
        {t('auth.selectCity')}
      </h2>
      <p className="text-center text-gray-600 dark:text-gray-400 mb-6">
        {t('auth.selectCityDescription')}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="space-y-2 max-h-96 overflow-y-auto mb-6">
          {cities.map((city) => (
            <button
              key={city.id}
              type="button"
              onClick={() => setSelectedCity(city.id)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                selectedCity === city.id
                  ? 'border-primary-600 bg-primary-50 dark:bg-primary-900/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="font-medium text-gray-900 dark:text-white">{city.name}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{city.country}</div>
            </button>
          ))}
        </div>

        <Button type="submit" className="w-full" disabled={!selectedCity || submitting}>
          {submitting ? t('app.loading') : t('common.confirm')}
        </Button>
      </form>
    </AuthLayout>
  );
};

