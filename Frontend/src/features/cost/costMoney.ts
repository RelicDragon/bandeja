import type { PriceCurrency, PriceType } from '@/types';
import { CURRENCY_INFO } from '@/utils/currency';

/**
 * PRD 348 — money formatting for the cost split ledger.
 *
 * `utils/currency.ts#formatPrice` hand-concatenates a symbol and always uses
 * `en-GB` grouping, which reads wrong in `ru`, `cs` and `ar`. Everything the
 * cost feature shows goes through `Intl.NumberFormat` with the **active locale**
 * and the **game's own currency** instead. Currencies are never converted.
 *
 * Amounts are integer minor units end to end — the division below is the only
 * place a cost amount becomes a float, and it happens purely for display.
 */

export function costMinorFactor(currency: PriceCurrency): number {
  const decimals = CURRENCY_INFO[currency]?.decimals ?? 2;
  return decimals === 0 ? 1 : 10 ** decimals;
}

export function costFractionDigits(currency: PriceCurrency): number {
  return CURRENCY_INFO[currency]?.decimals ?? 2;
}

/** `1000, 'EUR', 'de'` → `10,00 €`. Never throws on an unknown locale. */
export function formatCostMinor(
  amountMinor: number,
  currency: PriceCurrency,
  locale: string,
): string {
  const digits = costFractionDigits(currency);
  const value = amountMinor / costMinorFactor(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}

/** Parses what the keypad produced back into minor units. */
export function parseCostMajorToMinor(
  raw: string,
  currency: PriceCurrency,
): number | null {
  const normalized = raw.replace(',', '.').trim();
  if (normalized.length === 0) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * costMinorFactor(currency));
}

/** Minor units as a plain editable string, e.g. `1000, 'EUR'` → `10.00`. */
export function costMinorToMajorInput(
  amountMinor: number,
  currency: PriceCurrency,
): string {
  const digits = costFractionDigits(currency);
  return (amountMinor / costMinorFactor(currency)).toFixed(digits);
}

/**
 * PRD 348 — the "≈ 10 € each for 4 players" figure shown under the price field
 * while the game is still being created. Purely informational; nothing is stored.
 */
export function perHeadPreviewMinor(
  priceType: PriceType,
  priceTotal: number | undefined,
  currency: PriceCurrency,
  players: number,
): number | null {
  if (priceType !== 'TOTAL' && priceType !== 'PER_PERSON') return null;
  if (priceTotal == null || !Number.isFinite(priceTotal) || priceTotal <= 0) return null;
  if (!Number.isFinite(players) || players <= 0) return null;

  const factor = costMinorFactor(currency);
  const unit = Math.round(priceTotal * factor);
  if (unit <= 0) return null;
  if (priceType === 'PER_PERSON') return unit;
  return Math.round(unit / players);
}
