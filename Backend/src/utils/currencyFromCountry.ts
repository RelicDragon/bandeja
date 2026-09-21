import { resolveCountryIso2 } from '@bandeja/shared/geo/countryIso2';
import { DEFAULT_CURRENCY, SUPPORTED_CURRENCIES } from './constants';

const EUR_ZONE_ISO2 = new Set(
  'AD AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK MC SM VA ME'.split(' '),
);

const ISO2_TO_CURRENCY: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  JP: 'JPY',
  CN: 'CNY',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  PL: 'PLN',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  BG: 'BGN',
  IN: 'INR',
  BR: 'BRL',
  MX: 'MXN',
  RU: 'RUB',
  RS: 'RSD',
  TR: 'TRY',
  SG: 'SGD',
  HK: 'HKD',
  KR: 'KRW',
  TH: 'THB',
  MY: 'MYR',
  ID: 'IDR',
  PH: 'PHP',
  EC: 'USD',
  LI: 'CHF',
  GG: 'GBP',
  AE: 'AED',
  SA: 'SAR',
  QA: 'QAR',
  KW: 'KWD',
  OM: 'OMR',
};


export function normalizeCurrencyCode(raw: string | undefined): string {
  const code = (raw && typeof raw === 'string' ? raw : DEFAULT_CURRENCY).toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code) ? code : DEFAULT_CURRENCY;
}

export function currencyFromCountryIso2(country: string | undefined): string {
  return currencyFromCountryIso2OrUndefined(country) ?? DEFAULT_CURRENCY;
}

export function currencyFromCountryIso2OrUndefined(country: string | undefined): string | undefined {
  if (!country || country.length !== 2) return undefined;
  const c = country.toUpperCase();
  if (EUR_ZONE_ISO2.has(c)) return 'EUR';
  const mapped = ISO2_TO_CURRENCY[c];
  return mapped ? normalizeCurrencyCode(mapped) : undefined;
}

/**
 * `City.country` (a display name in production) → ISO-3166 alpha-2.
 *
 * The name map is shared with the frontend (`@bandeja/shared/geo/countryIso2`)
 * so the two sides can never disagree about which country a game is in —
 * PRD 348's payment-method catalogue is scoped by exactly this value.
 *
 * A 2-letter value is passed through as a code unless it is a known alias
 * ("UK" means GB), so this keeps working if the column is ever migrated.
 */
export function iso2FromCityCountry(country: string | null | undefined): string | undefined {
  return resolveCountryIso2(country);
}

export function currencyFromCityCountry(country: string | null | undefined): string | undefined {
  return currencyFromCountryIso2OrUndefined(iso2FromCityCountry(country));
}

export function canApplyInitialGeoCurrency(currency: string | null | undefined): boolean {
  const c = (currency ?? '').trim().toLowerCase();
  return !c || c === 'auto' || c === DEFAULT_CURRENCY.toLowerCase();
}

export function canApplyOngoingGeoCurrency(currency: string | null | undefined): boolean {
  const c = (currency ?? '').trim().toLowerCase();
  return !c || c === 'auto';
}
