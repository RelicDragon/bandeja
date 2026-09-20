/**
 * The price half of the "Edit game info" save payload (PRD 348).
 *
 * Pulled out of `EditGameInfoModal` because one line of it destroyed data: the
 * modal wrote `paymentHint: price.paymentHint.trim() || null` on **every** save
 * of a paid game, whether or not the organizer had touched the field. The seed
 * for that field is `game.paymentHint`, and a game object can legitimately
 * arrive without the key — the socket `game-updated` broadcast is projected for
 * the least-entitled member of the room and never carries it. An organizer who
 * had a saved IBAN, watched a player leave, then edited her description, sent
 * `paymentHint: null` and lost it.
 *
 * The rule: a field the viewer may not have received is written **only when it
 * changed**. An absent key is "leave it alone"; the backend's writable-scalar
 * pick (`update.service.ts`) skips what the body does not name.
 */
import type { PriceCurrency, PriceType } from '@/types';

export interface GameEditPriceState {
  priceType: PriceType;
  priceTotal: number | null | undefined;
  priceCurrency: PriceCurrency | undefined;
  paymentHint: string;
}

export interface GameEditPricePayload {
  priceType: PriceType;
  priceTotal?: number | null;
  priceCurrency?: PriceCurrency | null;
  paymentHint?: string | null;
}

/** `NOT_KNOWN` / `FREE` carry no amount and no payment handle. */
export function isPaidPriceType(priceType: PriceType): boolean {
  return priceType !== 'NOT_KNOWN' && priceType !== 'FREE';
}

/**
 * Build the price fields of the update body.
 *
 * @param current the tab state as edited
 * @param initial the tab state as seeded from the game
 */
export function buildGameEditPricePayload(
  current: GameEditPriceState,
  initial: GameEditPriceState,
): GameEditPricePayload {
  const payload: GameEditPricePayload = { priceType: current.priceType };

  if (!isPaidPriceType(current.priceType)) {
    payload.priceTotal = null;
    payload.priceCurrency = null;
    return payload;
  }

  if (current.priceTotal != null) payload.priceTotal = current.priceTotal;
  if (current.priceCurrency != null) payload.priceCurrency = current.priceCurrency;

  const nextHint = current.paymentHint.trim();
  if (nextHint !== initial.paymentHint.trim()) {
    payload.paymentHint = nextHint || null;
  }

  return payload;
}
