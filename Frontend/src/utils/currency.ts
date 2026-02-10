import { PriceCurrency } from '../types';

/**
 * Currency utilities for formatting and display
 */

export interface CurrencyInfo {
  code: PriceCurrency;
  name: string;
  symbol: string;
  position: 'before' | 'after';
  decimals: number;
}

export const CURRENCY_INFO: Record<PriceCurrency, CurrencyInfo> = {
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', position: 'before', decimals: 2 },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', position: 'before', decimals: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', position: 'before', decimals: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', position: 'before', decimals: 0 },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', position: 'before', decimals: 2 },
  CHF: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', position: 'after', decimals: 2 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', position: 'before', decimals: 2 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', position: 'before', decimals: 2 },
  NZD: { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', position: 'before', decimals: 2 },
  SEK: { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', position: 'after', decimals: 2 },
  NOK: { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', position: 'after', decimals: 2 },
  DKK: { code: 'DKK', name: 'Danish Krone', symbol: 'kr', position: 'after', decimals: 2 },
  PLN: { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', position: 'after', decimals: 2 },
  CZK: { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč', position: 'after', decimals: 2 },
  HUF: { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft', position: 'after', decimals: 2 },
  RON: { code: 'RON', name: 'Romanian Leu', symbol: 'lei', position: 'after', decimals: 2 },
  BGN: { code: 'BGN', name: 'Bulgarian Lev', symbol: 'лв', position: 'after', decimals: 2 },
  RUB: { code: 'RUB', name: 'Russian Ruble', symbol: '₽', position: 'before', decimals: 2 },
  RSD: { code: 'RSD', name: 'Serbian Dinar', symbol: 'RSD', position: 'after', decimals: 2 },
  TRY: { code: 'TRY', name: 'Turkish Lira', symbol: '₺', position: 'before', decimals: 2 },
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', position: 'before', decimals: 2 },
  BRL: { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', position: 'before', decimals: 2 },
  MXN: { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', position: 'before', decimals: 2 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', position: 'before', decimals: 2 },
  HKD: { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', position: 'before', decimals: 2 },
  KRW: { code: 'KRW', name: 'South Korean Won', symbol: '₩', position: 'before', decimals: 0 },
  THB: { code: 'THB', name: 'Thai Baht', symbol: '฿', position: 'before', decimals: 2 },
  MYR: { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', position: 'before', decimals: 2 },
  IDR: { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', position: 'before', decimals: 0 },
  PHP: { code: 'PHP', name: 'Philippine Peso', symbol: '₱', position: 'before', decimals: 2 },
};

export const SUPPORTED_CURRENCIES: PriceCurrency[] = Object.keys(CURRENCY_INFO) as PriceCurrency[];

export const DEFAULT_CURRENCY: PriceCurrency = 'EUR';

export function resolveUserCurrency(userCurrency?: string | null): PriceCurrency {
  if (userCurrency && SUPPORTED_CURRENCIES.includes(userCurrency as PriceCurrency)) {
    return userCurrency as PriceCurrency;
  }
  return DEFAULT_CURRENCY;
}

/**
 * Format price with currency symbol
 * @param priceCents Price in cents
 * @param currency Currency code
 * @returns Formatted price string
 */
export function formatPrice(priceCents: number | null | undefined, currency: PriceCurrency): string {
  if (priceCents === null || priceCents === undefined) return 'N/A';

  const info = CURRENCY_INFO[currency];
  const amount = priceCents / 100;

  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: info.decimals,
    maximumFractionDigits: info.decimals,
  });

  return info.position === 'before'
    ? `${info.symbol}${formatted}`
    : `${formatted} ${info.symbol}`;
}

/**
 * Get currency symbol
 * @param currency Currency code
 * @returns Currency symbol
 */
export function getCurrencySymbol(currency: PriceCurrency): string {
  return CURRENCY_INFO[currency]?.symbol || currency;
}

/**
 * Get currency name
 * @param currency Currency code
 * @returns Currency name
 */
export function getCurrencyName(currency: PriceCurrency): string {
  return CURRENCY_INFO[currency]?.name || currency;
}

/**
 * Get list of all currencies for dropdown
 * @returns Array of currency options
 */
export function getCurrencyOptions(): Array<{ value: PriceCurrency; label: string }> {
  return SUPPORTED_CURRENCIES.map(code => ({
    value: code,
    label: `${code} - ${CURRENCY_INFO[code].name}`,
  }));
}

/**
 * Parse price input and convert to cents
 * @param input User input string
 * @param currency Currency code
 * @returns Price in cents
 */
export function parsePriceInput(input: string, currency: PriceCurrency): number | null {
  const cleaned = input.replace(/[^\d.]/g, '');
  const num = parseFloat(cleaned);

  if (isNaN(num)) return null;

  const info = CURRENCY_INFO[currency];
  return Math.round(num * (info.decimals === 0 ? 1 : 100));
}

/**
 * Convert price and return both original and converted formatted strings
 * @param priceCents Original price in cents
 * @param originalCurrency Original currency
 * @param convertedCents Converted price in cents
 * @param userCurrency User's currency
 * @returns Object with formatted prices
 */
export function formatConvertedPrice(
  priceCents: number,
  originalCurrency: PriceCurrency,
  convertedCents: number,
  userCurrency: PriceCurrency
): {
  main: string;
  original: string;
  showBoth: boolean;
} {
  const showBoth = originalCurrency !== userCurrency;

  return {
    main: formatPrice(convertedCents, userCurrency),
    original: formatPrice(priceCents, originalCurrency),
    showBoth,
  };
}
