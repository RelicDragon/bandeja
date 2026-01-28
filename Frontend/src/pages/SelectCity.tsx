import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useCityList } from '@/hooks/useCityList';
import { useGeolocation } from '@/hooks/useGeolocation';
import { findNearestCity } from '@/utils/nearestCity';
import { CityListContent } from '@/components/CityListContent';

const LOCATION_ERROR_KEYS: Record<string, string> = {
  permission_denied: 'auth.locationDenied',
  position_unavailable: 'auth.locationUnavailable',
  timeout: 'auth.locationTimeout',
  unsupported: 'auth.locationUnsupported',
};

export const SelectCity = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updateUser = useAuthStore((state) => state.updateUser);

  const [selectedCity, setSelectedCity] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const cityList = useCityList({
    enabled: true,
    currentCityId: selectedCity,
    onFetchError: (setError) => setError(t('errors.generic')),
  });

  const geo = useGeolocation();

  const handleCityClick = (cityId: string) => {
    setSelectedCity(cityId);
    geo.clearError();
  };

  const handleUseLocation = async () => {
    cityList.setError('');
    geo.clearError();
    const { position, errorCode } = await geo.getPosition();
    if (!position) {
      const key = LOCATION_ERROR_KEYS[errorCode ?? ''] ?? 'auth.locationUnavailable';
      cityList.setError(t(key));
      return;
    }
    if (cityList.cities.length === 0) {
      cityList.setError(t('auth.locationUnavailable'));
      return;
    }
    const nearest = findNearestCity(cityList.cities, position.latitude, position.longitude);
    if (!nearest) {
      cityList.setError(t('auth.noCityNearby'));
      return;
    }
    setSelectedCity(nearest.id);
    cityList.selectCountry(nearest.country);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCity) return;
    setSubmitting(true);
    cityList.setError('');
    try {
      const response = await usersApi.switchCity(selectedCity);
      updateUser(response.data);
      navigate('/');
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

      <div className="mb-4 flex flex-col items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUseLocation}
          disabled={cityList.loading || geo.loading}
          className="gap-2"
        >
          <MapPin className="w-4 h-4 shrink-0" />
          {geo.loading ? t('app.loading') : t('auth.useMyLocation')}
        </Button>
        <span className="text-xs text-gray-500 dark:text-gray-400 text-center max-w-xs">
          {t('auth.locationRationale')}
        </span>
      </div>

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
          />
        </div>

        <Button type="submit" className="w-full shrink-0" disabled={!selectedCity || submitting}>
          {submitting ? t('app.loading') : t('common.confirm')}
        </Button>
      </form>
    </AuthLayout>
  );
};
