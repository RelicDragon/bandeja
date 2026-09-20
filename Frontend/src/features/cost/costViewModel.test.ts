import { describe, expect, it } from 'vitest';
import type { CostShare, GameCostSummary } from '@/api/gameCost';
import {
  canOfferCoinSettlement,
  isCostLedgerHidden,
  orderCostShares,
  previewEvenSplit,
  remindCooldownMs,
  summariseSettlement,
  viewerCostRole,
  viewerPrimaryAction,
} from './costViewModel';
import {
  buildGameEditPricePayload,
  isPaidPriceType,
  type GameEditPriceState,
} from './gameEditPricePayload';

/**
 * PRD 348 — the card's decisions, without rendering anything.
 *
 * Covers the two card states the PRD calls out (participant vs payer), both
 * branches of the settle sheet, and what the Wallet sections key off.
 */

function share(overrides: Partial<CostShare> & { userId: string }): CostShare {
  return {
    user: null,
    amountMinor: 1000,
    currency: 'EUR',
    state: 'UNPAID',
    markedPaidAt: null,
    confirmedAt: null,
    method: 'MANUAL',
    transactionId: null,
    isPayer: false,
    isOverridden: false,
    ...overrides,
  };
}

function summary(overrides: Partial<GameCostSummary> = {}): GameCostSummary {
  const shares = overrides.shares ?? [
    share({ userId: 'marko', isPayer: true, state: 'SETTLED' }),
    share({ userId: 'ana' }),
    share({ userId: 'ivo', state: 'MARKED_PAID' }),
    share({ userId: 'lea', state: 'SETTLED' }),
  ];
  return {
    gameId: 'g1',
    available: true,
    totalMinor: 4000,
    currency: 'EUR',
    payerUserId: 'marko',
    payer: null,
    paymentHint: null,
    frozenAt: null,
    estimated: true,
    shares,
    settledCount: shares.filter((s) => s.state === 'SETTLED').length,
    shareCount: shares.length,
    outstandingMinor: shares
      .filter((s) => s.state !== 'SETTLED')
      .reduce((sum, s) => sum + s.amountMinor, 0),
    viewerShare: null,
    canManage: false,
    canConfirm: false,
    canRemind: false,
    coinsPerCurrencyUnit: null,
    viewerCoinCost: null,
    viewerCoinBalance: 0,
    remindAvailableAt: null,
    ...overrides,
  };
}

describe('cost card visibility', () => {
  it('renders nothing without a summary', () => {
    expect(isCostLedgerHidden(undefined)).toBe(true);
  });

  it('renders nothing when the price type is unknown', () => {
    expect(isCostLedgerHidden(summary({ available: false }))).toBe(true);
  });

  it('renders nothing when the total is zero', () => {
    expect(isCostLedgerHidden(summary({ totalMinor: 0 }))).toBe(true);
  });

  it('renders nothing when there is no currency', () => {
    expect(isCostLedgerHidden(summary({ currency: null }))).toBe(true);
  });

  it('renders nothing when nobody holds a share', () => {
    expect(isCostLedgerHidden(summary({ shares: [] }))).toBe(true);
  });

  it('renders for a priced game with shares', () => {
    expect(isCostLedgerHidden(summary())).toBe(false);
  });
});

describe('participant vs payer card state', () => {
  it('gives a participant with an unpaid share the "I paid" button', () => {
    const viewer = share({ userId: 'ana' });
    const model = summary({ viewerShare: viewer });
    expect(viewerCostRole(model, 'ana')).toBe('DEBTOR');
    expect(viewerPrimaryAction(model, 'ana')).toBe('SETTLE');
  });

  it('shows the disabled "Settled" button once the payer confirmed', () => {
    const viewer = share({ userId: 'ana', state: 'SETTLED' });
    expect(viewerPrimaryAction(summary({ viewerShare: viewer }), 'ana')).toBe('SETTLED');
  });

  it('still offers settling while only self-declared', () => {
    const viewer = share({ userId: 'ana', state: 'MARKED_PAID' });
    expect(viewerPrimaryAction(summary({ viewerShare: viewer }), 'ana')).toBe('SETTLE');
  });

  it('gives the payer no settle button — they fronted the money', () => {
    const viewer = share({ userId: 'marko', isPayer: true, state: 'SETTLED' });
    const model = summary({ viewerShare: viewer, payerUserId: 'marko' });
    expect(viewerCostRole(model, 'marko')).toBe('PAYER');
    expect(viewerPrimaryAction(model, 'marko')).toBe('NONE');
  });

  it('gives a bystander no button at all', () => {
    const model = summary({ viewerShare: null });
    expect(viewerCostRole(model, 'stranger')).toBe('OBSERVER');
    expect(viewerPrimaryAction(model, 'stranger')).toBe('NONE');
  });

  it('pins the viewer’s own row to the top', () => {
    const rows = summary().shares;
    expect(orderCostShares(rows, 'lea').map((s) => s.userId)).toEqual([
      'lea',
      'marko',
      'ana',
      'ivo',
    ]);
    expect(orderCostShares(rows, null).map((s) => s.userId)).toEqual([
      'marko',
      'ana',
      'ivo',
      'lea',
    ]);
  });
});

describe('settle sheet branches', () => {
  const base = {
    viewerShare: share({ userId: 'ana' }),
    viewerCoinCost: 1000,
    viewerCoinBalance: 5000,
    coinsPerCurrencyUnit: 100,
  };

  it('offers coins when the rate is set and the balance covers it', () => {
    expect(canOfferCoinSettlement(summary(base))).toEqual({
      available: true,
      coins: 1000,
      balance: 5000,
    });
  });

  it('hides coins entirely when COINS_PER_CURRENCY_UNIT is unset', () => {
    const offer = canOfferCoinSettlement(summary({ ...base, coinsPerCurrencyUnit: null }));
    expect(offer.available).toBe(false);
  });

  it('hides coins when the backend could not price the share', () => {
    const offer = canOfferCoinSettlement(summary({ ...base, viewerCoinCost: null }));
    expect(offer.available).toBe(false);
  });

  it('hides coins the viewer cannot afford', () => {
    const offer = canOfferCoinSettlement(summary({ ...base, viewerCoinBalance: 999 }));
    expect(offer.available).toBe(false);
  });

  it('offers coins when the balance is exactly enough', () => {
    const offer = canOfferCoinSettlement(summary({ ...base, viewerCoinBalance: 1000 }));
    expect(offer.available).toBe(true);
  });

  it('treats a missing balance as zero rather than as unlimited', () => {
    const offer = canOfferCoinSettlement(summary({ ...base, viewerCoinBalance: null }));
    expect(offer).toEqual({ available: false, coins: null, balance: 0 });
  });
});

describe('organizer summary strip', () => {
  it('counts settled rows and the outstanding money', () => {
    expect(summariseSettlement(summary())).toEqual({
      settled: 2,
      total: 4,
      outstandingMinor: 2000,
      allSettled: false,
    });
  });

  it('flips to "all settled" when nothing is outstanding', () => {
    const shares = [
      share({ userId: 'marko', isPayer: true, state: 'SETTLED' }),
      share({ userId: 'ana', state: 'SETTLED' }),
    ];
    expect(summariseSettlement(summary({ shares })).allSettled).toBe(true);
  });

  it('is not "all settled" with no rows at all', () => {
    expect(summariseSettlement(summary({ shares: [] })).allSettled).toBe(false);
  });
});

describe('remind cooldown', () => {
  const now = Date.parse('2026-02-01T12:00:00.000Z');

  it('is zero when the organizer may nudge now', () => {
    expect(remindCooldownMs(null, now)).toBe(0);
    expect(remindCooldownMs('2026-02-01T11:00:00.000Z', now)).toBe(0);
  });

  it('reports the remaining window', () => {
    expect(remindCooldownMs('2026-02-01T14:00:00.000Z', now)).toBe(2 * 60 * 60 * 1000);
  });

  it('survives a malformed timestamp', () => {
    expect(remindCooldownMs('not a date', now)).toBe(0);
  });
});

describe('override preview matches the backend split', () => {
  it('sends the rounding remainder to the payer', () => {
    expect(previewEvenSplit(1000, ['a', 'b', 'c'], 'b', {})).toEqual({
      a: 333,
      b: 334,
      c: 333,
    });
  });

  it('lets the untouched players absorb an override', () => {
    // 3500 / 3 = 1166 each with 2 cents over; the payer takes the remainder,
    // exactly as `splitCostShares` does on the backend.
    expect(previewEvenSplit(4000, ['a', 'b', 'c', 'd'], 'a', { d: 500 })).toEqual({
      a: 1168,
      b: 1166,
      c: 1166,
      d: 500,
    });
  });

  it('never goes negative when an override exceeds the total', () => {
    expect(previewEvenSplit(1000, ['a', 'b'], 'a', { b: 5000 })).toEqual({ a: 0, b: 5000 });
  });

  it('returns the overrides verbatim when everybody is fixed', () => {
    expect(previewEvenSplit(4000, ['a', 'b'], 'a', { a: 3000, b: 1000 })).toEqual({
      a: 3000,
      b: 1000,
    });
  });
});

/**
 * PRD 348 — the edit-modal price payload.
 *
 * `paymentHint` is the one game field a viewer can legitimately not have
 * received: the socket `game-updated` broadcast is projected for the
 * least-entitled member of the room and strips it. The modal seeded its field
 * from that possibly-absent key and then wrote it back on **every** save of a
 * paid game, so an organizer who edited her description after a player left the
 * game sent `paymentHint: null` and lost her saved IBAN.
 */
describe('buildGameEditPricePayload', () => {
  const paid: GameEditPriceState = {
    priceType: 'TOTAL',
    priceTotal: 40,
    priceCurrency: 'EUR',
    paymentHint: 'IBAN RS35 1234 5678',
  };

  it('omits paymentHint when the organizer did not touch it', () => {
    const payload = buildGameEditPricePayload(paid, paid);

    expect('paymentHint' in payload).toBe(false);
    expect(payload).toEqual({ priceType: 'TOTAL', priceTotal: 40, priceCurrency: 'EUR' });
  });

  it('omits it even when the seed is empty because the payload never carried it', () => {
    // The exact post-broadcast state: `game.paymentHint` was absent, so the
    // field seeded blank. Saving an unrelated change must not clear the column.
    const seededBlank: GameEditPriceState = { ...paid, paymentHint: '' };
    const payload = buildGameEditPricePayload(seededBlank, seededBlank);

    expect('paymentHint' in payload).toBe(false);
  });

  it('sends the new value when the organizer edits the field', () => {
    const edited: GameEditPriceState = { ...paid, paymentHint: '  Revolut @marko  ' };

    expect(buildGameEditPricePayload(edited, paid).paymentHint).toBe('Revolut @marko');
  });

  it('sends null when the organizer deliberately clears a hint she can see', () => {
    const cleared: GameEditPriceState = { ...paid, paymentHint: '   ' };

    expect(buildGameEditPricePayload(cleared, paid).paymentHint).toBeNull();
  });

  it('treats whitespace-only edits as no change', () => {
    const padded: GameEditPriceState = { ...paid, paymentHint: '  IBAN RS35 1234 5678 ' };

    expect('paymentHint' in buildGameEditPricePayload(padded, paid)).toBe(false);
  });

  it('drops the amount and the hint when the game turns free', () => {
    const free: GameEditPriceState = { ...paid, priceType: 'FREE' };
    const payload = buildGameEditPricePayload(free, paid);

    expect(payload).toEqual({ priceType: 'FREE', priceTotal: null, priceCurrency: null });
    expect('paymentHint' in payload).toBe(false);
  });

  it('agrees with isPaidPriceType about which types carry money', () => {
    expect(isPaidPriceType('TOTAL')).toBe(true);
    expect(isPaidPriceType('PER_PERSON')).toBe(true);
    expect(isPaidPriceType('PER_TEAM')).toBe(true);
    expect(isPaidPriceType('FREE')).toBe(false);
    expect(isPaidPriceType('NOT_KNOWN')).toBe(false);
  });

  it('keeps an unset amount out of the payload', () => {
    const noAmount: GameEditPriceState = {
      priceType: 'PER_PERSON',
      priceTotal: null,
      priceCurrency: undefined,
      paymentHint: '',
    };

    expect(buildGameEditPricePayload(noAmount, noAmount)).toEqual({ priceType: 'PER_PERSON' });
  });
});
