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
};

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  andorra: 'AD',
  austria: 'AT',
  belgium: 'BE',
  cyprus: 'CY',
  germany: 'DE',
  estonia: 'EE',
  spain: 'ES',
  finland: 'FI',
  france: 'FR',
  greece: 'GR',
  croatia: 'HR',
  ireland: 'IE',
  italy: 'IT',
  lithuania: 'LT',
  luxembourg: 'LU',
  latvia: 'LV',
  malta: 'MT',
  netherlands: 'NL',
  portugal: 'PT',
  slovenia: 'SI',
  slovakia: 'SK',
  monaco: 'MC',
  'san marino': 'SM',
  'vatican city': 'VA',
  'united states': 'US',
  usa: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  'great britain': 'GB',
  england: 'GB',
  canada: 'CA',
  australia: 'AU',
  'new zealand': 'NZ',
  japan: 'JP',
  china: 'CN',
  switzerland: 'CH',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
  poland: 'PL',
  'czech republic': 'CZ',
  czechia: 'CZ',
  hungary: 'HU',
  romania: 'RO',
  bulgaria: 'BG',
  india: 'IN',
  brazil: 'BR',
  mexico: 'MX',
  russia: 'RU',
  serbia: 'RS',
  srbija: 'RS',
  србија: 'RS',
  сербия: 'RS',
  serbien: 'RS',
  'republic of serbia': 'RS',
  'republika srbija': 'RS',
  montenegro: 'ME',
  ecuador: 'EC',
  liechtenstein: 'LI',
  guernsey: 'GG',
  turkey: 'TR',
  singapore: 'SG',
  'hong kong': 'HK',
  'south korea': 'KR',
  korea: 'KR',
  thailand: 'TH',
  malaysia: 'MY',
  indonesia: 'ID',
  philippines: 'PH',
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

function isKnownIso2(code: string): boolean {
  return EUR_ZONE_ISO2.has(code) || Object.prototype.hasOwnProperty.call(ISO2_TO_CURRENCY, code);
}

export function iso2FromCityCountry(country: string | null | undefined): string | undefined {
  if (!country) return undefined;
  const trimmed = country.trim();
  if (!trimmed) return undefined;
  if (trimmed.length === 2) {
    const iso = trimmed.toUpperCase();
    if (isKnownIso2(iso)) return iso;
    const fromName = COUNTRY_NAME_TO_ISO2[trimmed.toLowerCase()];
    if (fromName) return fromName;
    return iso;
  }
  return COUNTRY_NAME_TO_ISO2[trimmed.toLowerCase()];
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
