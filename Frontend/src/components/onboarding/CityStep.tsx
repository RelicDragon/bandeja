import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MapPin } from 'lucide-react';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useCityList } from '@/hooks/useCityList';
import { CityListContent } from '@/components/CityListContent';
import { ClubMiniMap } from '@/components/ClubMiniMap';
import { OnboardingFrame, type OnboardingStepChrome } from './OnboardingFrame';

/**
 * PRD 350 step 4 — Your city.
 *
 * The auto-detected city as a card with a map thumbnail and a straight
 * question: Yes, or Change. "Change" swaps the card for the existing city
 * picker content inline (the same `CityListContent` the `CityModal` sheet
 * renders) rather than stacking a sheet on top of the flow.
 */
export function CityStep(chrome: OnboardingStepChrome) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const city = user?.currentCity;
  const [picking, setPicking] = useState(!city);
  const [submitting, setSubmitting] = useState(false);

  const cityList = useCityList({
    enabled: picking,
    currentCityId: city?.id,
    onFetchError: (setError) => setError(t('onboarding.errors.saveFailed')),
  });

  const handlePick = async (cityId: string) => {
    if (cityId === city?.id) {
      setPicking(false);
      return;
    }
    setSubmitting(true);
    try {
      const response = await usersApi.switchCity(cityId);
      updateUser(response.data);
      setPicking(false);
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('onboarding.errors.saveFailed');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const coordinates =
    typeof city?.latitude === 'number' && typeof city?.longitude === 'number'
      ? { latitude: city.latitude, longitude: city.longitude }
      : null;

  return (
    <OnboardingFrame
      {...chrome}
      step="city"
      title={t('onboarding.city.title')}
      subtitle={t('onboarding.city.helper')}
      primaryLabel={picking ? undefined : t('onboarding.city.confirm')}
      onPrimary={picking ? undefined : chrome.onAdvance}
      primaryBusy={submitting}
      footerExtra={
        picking && city ? (
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-xl px-4 text-sm font-semibold text-gray-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400"
          >
            {t('onboarding.city.backToCard')}
          </button>
        ) : !picking ? (
          <button
            type="button"
            onClick={() => setPicking(true)}
            data-testid="onboarding-city-change"
            className="inline-flex min-h-[2.75rem] items-center justify-center rounded-xl px-4 text-sm font-semibold text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
          >
            {t('onboarding.city.change')}
          </button>
        ) : null
      }
    >
      {picking ? (
        <div className="flex min-h-[22rem] flex-col" data-testid="onboarding-city-picker">
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
            currentCityId={city?.id}
            selectedId={city?.id}
            onCityClick={(cityId) => void handlePick(cityId)}
            submitting={submitting}
            citiesCount={cityList.cities.length}
          />
        </div>
      ) : (
        <div
          data-testid="onboarding-city-card"
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {coordinates ? (
            <ClubMiniMap latitude={coordinates.latitude} longitude={coordinates.longitude} />
          ) : (
            <div
              aria-hidden
              className="flex h-44 w-full items-center justify-center bg-gradient-to-b from-primary-100 to-primary-50 dark:from-primary-950/50 dark:to-gray-800"
            >
              <MapPin className="h-10 w-10 text-primary-600 dark:text-primary-400" />
            </div>
          )}
          <div className="flex items-center gap-3 px-4 py-3">
            <MapPin className="h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-gray-900 dark:text-white">
                {city?.name ?? t('onboarding.city.unknown')}
              </p>
              {city?.country ? (
                <p className="truncate text-sm text-gray-500 dark:text-gray-400">{city.country}</p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </OnboardingFrame>
  );
}
