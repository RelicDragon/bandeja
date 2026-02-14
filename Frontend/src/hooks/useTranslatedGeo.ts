import { useTranslation } from 'react-i18next';
import { useGeoReady } from '@/hooks/useGeoReady';
import {
  getCountryDisplayName,
  getCountryNativeName,
  getCityDisplayName,
  getCityNativeName,
} from '@/utils/geoTranslations';

export function useTranslatedGeo() {
  const { i18n } = useTranslation();
  useGeoReady();
  const locale = i18n.language;

  return {
    locale,
    translateCountry: (countryKey: string) => getCountryDisplayName(countryKey, locale),
    translateCountryNative: (countryKey: string) => getCountryNativeName(countryKey),
    translateCity: (cityId: string, cityName: string, countryKey: string) =>
      getCityDisplayName(cityId, cityName, countryKey, locale),
    translateCityNative: (cityId: string, cityName: string, countryKey: string) =>
      getCityNativeName(cityId, cityName, countryKey),
  };
}
