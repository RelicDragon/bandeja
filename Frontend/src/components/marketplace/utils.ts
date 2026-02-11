import { MarketItem } from '@/types';

export const formatPriceDisplay = (item: MarketItem, negotiableLabel: string, freeLabel: string) => {
  // Check if FREE trade type is present
  if (item.tradeTypes?.includes('FREE')) {
    return freeLabel;
  }
  if (item.priceCents != null) return `${(item.priceCents / 100).toFixed(2)} ${item.currency}`;
  return negotiableLabel;
};

export const priceToCents = (v: string): number | undefined => {
  if (!v || v === '.') return undefined;
  const n = parseFloat(v);
  return isNaN(n) ? undefined : Math.round(n * 100);
};

export const centsToPrice = (cents: number | null | undefined): string => {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
};
