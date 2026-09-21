/**
 * The price half of the "Edit game info" save payload (PRD 348).
 *
 * Pulled out of `EditGameInfoModal` because one line of it destroyed data: the
 * modal wrote the payment field on **every** save of a paid game, whether or
 * not the organizer had touched it. The seed is `game.paymentMethods`, and a
 * game object can legitimately arrive without the key — the socket
 * `game-updated` broadcast is projected for the least-entitled member of the
 * room and never carries it. An organizer who had a saved IBAN, watched a
 * player leave, then edited her description, sent a blank and lost it.
 *
 * The rule: a field the viewer may not have received is written **only when it
 * changed**. An absent key is "leave it alone"; the backend's writable-scalar
 * pick (`update.service.ts`) skips what the body does not name.
 */
import type { PaymentMethodEntry } from '@shared/payments/paymentMethodSelection';
import type { PriceCurrency, PriceType } from '@/types';

export interface GameEditPriceState {
  priceType: PriceType;
  priceTotal: number | null | undefined;
  priceCurrency: PriceCurrency | undefined;
  paymentMethods: PaymentMethodEntry[];
}

export interface GameEditPricePayload {
  priceType: PriceType;
  priceTotal?: number | null;
  priceCurrency?: PriceCurrency | null;
  paymentMethods?: PaymentMethodEntry[] | null;
}

/**
 * Trim the handles and drop the rows that say nothing: a method added in the
 * picker and then left blank is not an instruction, and must not be saved as
 * one. `CASH` has no handle and always survives.
 */
export function cleanPaymentMethods(
  entries: readonly PaymentMethodEntry[],
): PaymentMethodEntry[] {
  return entries
    .map((entry) => ({
      method: entry.method,
      handle: entry.handle == null ? null : entry.handle.replace(/\s+/g, ' ').trim() || null,
    }))
    .filter((entry) => entry.handle !== null || entry.method === 'CASH');
}

function samePaymentMethods(
  a: readonly PaymentMethodEntry[],
  b: readonly PaymentMethodEntry[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (entry, index) => entry.method === b[index].method && entry.handle === b[index].handle,
  );
}

/** `NOT_KNOWN` / `FREE` carry no amount and no payment methods. */
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

  const next = cleanPaymentMethods(current.paymentMethods);
  if (!samePaymentMethods(next, cleanPaymentMethods(initial.paymentMethods))) {
    payload.paymentMethods = next.length > 0 ? next : null;
  }

  return payload;
}
