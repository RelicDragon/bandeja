import { MarketItem, PriceCurrency } from '@/types';
import { formatPrice, getCurrencyMinorFactor, CURRENCY_INFO } from '@/utils/currency';

export const formatPriceDisplay = (item: MarketItem, negotiableLabel: string, freeLabel: string) => {
  if (item.tradeTypes?.includes('FREE')) {
    return freeLabel;
  }
  if (item.priceCents != null) {
    const currency = (item.currency || 'EUR') as PriceCurrency;
    return formatPrice(item.priceCents, currency);
  }
  return negotiableLabel;
};

export const priceToCents = (v: string, currency: PriceCurrency = 'EUR'): number | undefined => {
  if (!v || v === '.') return undefined;
  const n = parseFloat(v);
  return isNaN(n) ? undefined : Math.round(n * getCurrencyMinorFactor(currency));
};

export const centsToPrice = (
  cents: number | null | undefined,
  currency: PriceCurrency = 'EUR',
): string => {
  if (cents == null) return '';
  const decimals = CURRENCY_INFO[currency]?.decimals ?? 2;
  return (cents / getCurrencyMinorFactor(currency)).toFixed(decimals);
};

export const currencyInputStep = (currency: PriceCurrency): string => {
  const decimals = CURRENCY_INFO[currency]?.decimals ?? 2;
  if (decimals <= 0) return '1';
  return (1 / 10 ** decimals).toFixed(decimals);
};
