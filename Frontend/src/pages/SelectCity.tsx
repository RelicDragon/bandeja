import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useCityList } from '@/hooks/useCityList';
import { CityListContent } from '@/components/CityListContent';

export const SelectCity = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const updateUser = useAuthStore((state) => state.updateUser);
  const from = (location.state as { from?: string })?.from;

  const [selectedCity, setSelectedCity] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const cityList = useCityList({
    enabled: true,
    currentCityId: selectedCity,
    onFetchError: (setError) => setError(t('errors.generic')),
  });

  const handleCityClick = (cityId: string) => {
    setSelectedCity(cityId);
    cityList.setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCity) return;
    setSubmitting(true);
    cityList.setError('');
    try {
      const response = await usersApi.switchCity(selectedCity);
      updateUser(response.data);
      navigate(from || '/');
    } catch (err: any) {
      cityList.setError(err.response?.data?.message || t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-white">
        {t('auth.selectCity')}
      </h2>
      <p className="text-center text-gray-600 dark:text-gray-400 mb-4">
        {t('auth.selectCityDescription')}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 max-h-[min(24rem,50vh)] overflow-hidden mb-6 flex flex-col">
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
            currentCityId={selectedCity}
            onCityClick={handleCityClick}
            showError={true}
            submitting={submitting}
            citiesCount={cityList.cities.length}
            onLocationError={cityList.setError}
          />
        </div>

        <Button type="submit" className="w-full shrink-0" disabled={!selectedCity || submitting}>
          {submitting ? t('app.loading') : t('common.confirm')}
        </Button>
      </form>
    </AuthLayout>
  );
};
