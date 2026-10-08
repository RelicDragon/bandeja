/**
 * The price half of the "Edit game info" save payload.
 *
 * A paid price type carries a total and a currency; `NOT_KNOWN` / `FREE`
 * clear both. An unset total or currency is left out of the body so the
 * backend's writable-scalar pick (`update.service.ts`) leaves the stored value
 * alone.
 */
import type { PriceCurrency, PriceType } from '@/types';

export interface GameEditPriceState {
  priceType: PriceType;
  priceTotal: number | null | undefined;
  priceCurrency: PriceCurrency | undefined;
}

export interface GameEditPricePayload {
  priceType: PriceType;
  priceTotal?: number | null;
  priceCurrency?: PriceCurrency | null;
}

/** `NOT_KNOWN` / `FREE` carry no amount. */
export function isPaidPriceType(priceType: PriceType): boolean {
  return priceType !== 'NOT_KNOWN' && priceType !== 'FREE';
}

/** Build the price fields of the update body from the tab state as edited. */
export function buildGameEditPricePayload(current: GameEditPriceState): GameEditPricePayload {
  const payload: GameEditPricePayload = { priceType: current.priceType };

  if (!isPaidPriceType(current.priceType)) {
    payload.priceTotal = null;
    payload.priceCurrency = null;
    return payload;
  }

  if (current.priceTotal != null) payload.priceTotal = current.priceTotal;
  if (current.priceCurrency != null) payload.priceCurrency = current.priceCurrency;

  return payload;
}
