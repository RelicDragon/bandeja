import { DEFAULT_CURRENCY } from '../../utils/constants';
import {
  canApplyInitialGeoCurrency,
  currencyFromCityCountry,
  normalizeCurrencyCode,
} from '../../utils/currencyFromCountry';

function assignedCode(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

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

export function resolveCurrencyForFirstCityConfirm(params: {
  currentCurrency?: string | null;
  cityCountry?: string | null;
  previousCityCountry?: string | null;
}): string | undefined {
  const next = currencyFromCityCountry(params.cityCountry);
  if (!next) return undefined;

  const current = assignedCode(params.currentCurrency);
  if (!current || current === 'AUTO') return next;

  const previous = currencyFromCityCountry(params.previousCityCountry);
  if (previous && current === previous) return next;

  if (current === DEFAULT_CURRENCY) {
    if (previous && previous !== DEFAULT_CURRENCY) return undefined;
    return next;
  }

  return undefined;
}
