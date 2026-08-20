import {
  canApplyInitialGeoCurrency,
  currencyFromCityCountry,
  normalizeCurrencyCode,
} from '../../utils/currencyFromCountry';

export function resolveInitialDefaultCurrency(params: {
  currentCurrency: string | null | undefined;
  cityCountry?: string | null;
  geoCurrency?: string | null;
}): string | undefined {
  if (!canApplyInitialGeoCurrency(params.currentCurrency)) {
    return undefined;
  }
  const fromCity = currencyFromCityCountry(params.cityCountry);
  if (fromCity) return fromCity;
  if (params.geoCurrency) {
    return normalizeCurrencyCode(params.geoCurrency);
  }
  return undefined;
}
