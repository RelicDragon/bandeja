import type { PriceCurrency, PriceType } from '@prisma/client';

/**
 * PRD 348 — pure share math for the cost split ledger.
 *
 * Everything here is deterministic and free of Prisma, clocks and I/O so the
 * table tests in `costShareMath.test.ts` can pin every rounding decision.
 *
 * **Money is always integer minor units** (cents / fils / yen). Never a float:
 * `Game.priceTotal` is the only float in the chain and it is converted once, at
 * the boundary, by {@link resolveGameTotalMinor}.
 */

/**
 * Minor units per one major unit of a currency.
 *
 * Mirrors the private `CurrencyService.minorFactor` in
 * `Backend/src/services/currency.service.ts` and `getCurrencyMinorFactor` in
 * `Frontend/src/utils/currency.ts`. The three must agree — a mismatch would
 * make a share read 100× too large in one surface.
 */
export function currencyMinorFactor(currency: PriceCurrency): number {
  if (currency === 'JPY' || currency === 'KRW' || currency === 'IDR') return 1;
  if (currency === 'KWD' || currency === 'OMR') return 1000;
  return 100;
}

/**
 * Price types the split can be derived from.
 *
 * `PER_TEAM` is deliberately absent: a team price only yields a game total when
 * the team count is known, and nothing on `Game` states it. Such games show no
 * cost card (documented in `docs/plans/prd-345-357/reports/prd-348.md`).
 */
export const COST_SPLIT_PRICE_TYPES: readonly PriceType[] = ['TOTAL', 'PER_PERSON'];

export function isCostSplitPriceType(priceType: PriceType | null | undefined): boolean {
  return priceType != null && COST_SPLIT_PRICE_TYPES.includes(priceType);
}

export type ResolveGameTotalInput = {
  priceType: PriceType | null | undefined;
  /** `Game.priceTotal` — major units, the only float in the chain. */
  priceTotal: number | null | undefined;
  currency: PriceCurrency | null | undefined;
  /** How many people the price covers when `priceType` is `PER_PERSON`. */
  payerCount: number;
};

/**
 * The game's total cost in minor units, or `null` when there is nothing to
 * split (unknown price, free game, zero total, no currency, empty roster).
 *
 * A `null` here is the single switch that hides the whole feature for a game.
 */
export function resolveGameTotalMinor(input: ResolveGameTotalInput): number | null {
  const { priceType, priceTotal, currency, payerCount } = input;
  if (!isCostSplitPriceType(priceType)) return null;
  if (currency == null) return null;
  if (priceTotal == null || !Number.isFinite(priceTotal) || priceTotal <= 0) return null;
  if (!Number.isInteger(payerCount) || payerCount <= 0) return null;

  const factor = currencyMinorFactor(currency);
  const perUnit = Math.round(priceTotal * factor);
  if (perUnit <= 0) return null;

  const total = priceType === 'PER_PERSON' ? perUnit * payerCount : perUnit;
  return total > 0 ? total : null;
}

export type CostShareSplitInput = {
  /** Total to distribute, minor units. Must be a non-negative integer. */
  totalMinor: number;
  /**
   * Who the total is split between, in a stable order. The caller owns the
   * ordering — it decides who absorbs the rounding remainder when there is no
   * payer among them.
   */
  participantIds: string[];
  /** Whoever fronted the money. Absorbs the rounding remainder. */
  payerId: string | null;
  /**
   * Fixed per-player amounts in minor units (organizer overrides). Entries for
   * ids outside `participantIds` are ignored; negatives are clamped to 0.
   */
  overrides?: Readonly<Record<string, number>>;
  /**
   * `true` (default) — the players without an override absorb the difference,
   * so the amounts always sum to `totalMinor`.
   * `false` — the players without an override keep the plain even split of the
   * full total, so an override changes what the group pays in aggregate.
   */
  splitRemainderEvenly?: boolean;
};

export type CostShareSplitRow = {
  userId: string;
  amountMinor: number;
  /** `true` when the amount came from `overrides`, not from the even split. */
  overridden: boolean;
};

/**
 * Split `totalMinor` across `participantIds`.
 *
 * Rounding rule: everyone gets `floor(target / n)` and **the payer takes the
 * remainder**. When the payer is not among the free (non-overridden) players
 * the first free player in the given order takes it instead, so the result is
 * still deterministic and still sums to the target.
 */
export function splitCostShares(input: CostShareSplitInput): CostShareSplitRow[] {
  const {
    totalMinor,
    participantIds,
    payerId,
    overrides = {},
    splitRemainderEvenly = true,
  } = input;

  const ids = dedupe(participantIds);
  if (ids.length === 0) return [];

  const safeTotal = Math.max(0, Math.trunc(totalMinor));

  const fixed = new Map<string, number>();
  for (const id of ids) {
    const raw = overrides[id];
    if (raw == null || !Number.isFinite(raw)) continue;
    fixed.set(id, Math.max(0, Math.round(raw)));
  }

  const freeIds = ids.filter((id) => !fixed.has(id));

  if (freeIds.length === 0) {
    return ids.map((userId) => ({
      userId,
      amountMinor: fixed.get(userId) ?? 0,
      overridden: true,
    }));
  }

  let target: number;
  if (splitRemainderEvenly) {
    let fixedSum = 0;
    for (const value of fixed.values()) fixedSum += value;
    target = Math.max(0, safeTotal - fixedSum);
  } else {
    // Free players keep the even split of the *whole* total; the group's sum
    // then deliberately drifts away from it.
    target = Math.max(0, Math.round((safeTotal / ids.length) * freeIds.length));
  }

  const base = Math.floor(target / freeIds.length);
  const remainder = target - base * freeIds.length;
  const remainderHolder =
    payerId != null && freeIds.includes(payerId) ? payerId : freeIds[0];

  return ids.map((userId) => {
    const override = fixed.get(userId);
    if (override != null) {
      return { userId, amountMinor: override, overridden: true };
    }
    const amountMinor = base + (userId === remainderHolder ? remainder : 0);
    return { userId, amountMinor, overridden: false };
  });
}

export type ExistingShareAmount = { userId: string; amountMinor: number };

/**
 * Which of the stored rows carry an organizer override.
 *
 * `GameCostShare` has no "overridden" column, so it is derived by inverting
 * {@link splitCostShares}: the overridden rows are exactly the ones that must be
 * held fixed for the *rest* of the rows to be the even split of what is left,
 * remainder on the payer.
 *
 * It cannot be done in one pass. An override shifts the canonical base for every
 * other player, so comparing each row against an even split of the **whole**
 * total flags the innocent absorbers as well (40 € with a 5 € guest stores
 * 1168/1166/1166/500, none of which equals 1000). Instead the single most
 * out-of-line row is peeled off, the remaining rows are re-split over the
 * remaining money, and the check repeats. Each pass either finds a clean split
 * and stops, or fixes exactly one more row, so it terminates in at most
 * `rows.length` passes; with one free row left the split is its own amount by
 * construction, so the loop always converges.
 *
 * The one false negative — a manual amount that happens to equal the even split
 * — is harmless: the value is preserved either way until the roster changes.
 */
export function detectOverriddenUserIds(
  rows: readonly ExistingShareAmount[],
  payerId: string | null,
): string[] {
  if (rows.length === 0) return [];

  let previousTotal = 0;
  for (const row of rows) previousTotal += row.amountMinor;

  const overridden = new Set<string>();

  for (let pass = 0; pass < rows.length; pass += 1) {
    const freeRows = rows.filter((row) => !overridden.has(row.userId));
    if (freeRows.length === 0) break;

    let fixedSum = 0;
    for (const row of rows) {
      if (overridden.has(row.userId)) fixedSum += row.amountMinor;
    }

    const canonical = splitCostShares({
      totalMinor: previousTotal - fixedSum,
      participantIds: freeRows.map((row) => row.userId),
      payerId,
    });
    const canonicalById = new Map(canonical.map((row) => [row.userId, row.amountMinor]));

    let worst: { userId: string; delta: number; isPayer: boolean } | null = null;
    for (const row of freeRows) {
      const delta = Math.abs((canonicalById.get(row.userId) ?? 0) - row.amountMinor);
      if (delta === 0) continue;
      const isPayer = payerId != null && row.userId === payerId;
      // Ties go to whoever is not the payer: the payer is the one who absorbs
      // the remainder, so they are the less likely candidate for a hand-set
      // amount when the evidence is symmetric.
      const better =
        worst == null ||
        delta > worst.delta ||
        (delta === worst.delta && worst.isPayer && !isPayer);
      if (better) worst = { userId: row.userId, delta, isPayer };
    }

    // Every remaining row is exactly the even split of what is left: done.
    if (worst == null) break;
    overridden.add(worst.userId);
  }

  return rows.filter((row) => overridden.has(row.userId)).map((row) => row.userId);
}

export type RecomputeSharesInput = {
  totalMinor: number;
  /** The roster the total is split across now, in a stable order. */
  participantIds: string[];
  payerId: string | null;
  /** Rows already stored for this game (any user, including ones who left). */
  existing: readonly ExistingShareAmount[];
  /**
   * Rows that must keep their stored amount no matter what — a coin transfer
   * already moved that money. Kept out of the even split and subtracted from
   * the target.
   */
  pinnedUserIds?: readonly string[];
  /** Explicit overrides from `PUT /cost-shares`, applied on top of the derived ones. */
  overrides?: Readonly<Record<string, number>>;
  splitRemainderEvenly?: boolean;
};

/**
 * The next set of amounts for a game, preserving organizer overrides across a
 * roster change.
 *
 * Overrides for players who are no longer on the roster drop out; the remaining
 * total is re-split evenly across everyone else with the remainder to the payer.
 */
export function recomputeShares(input: RecomputeSharesInput): CostShareSplitRow[] {
  const {
    totalMinor,
    participantIds,
    payerId,
    existing,
    pinnedUserIds = [],
    overrides = {},
    splitRemainderEvenly = true,
  } = input;

  const existingById = new Map(existing.map((row) => [row.userId, row.amountMinor]));
  const derivedOverrideIds = detectOverriddenUserIds(existing, payerId);

  const effectiveOverrides: Record<string, number> = {};
  for (const userId of derivedOverrideIds) {
    const amount = existingById.get(userId);
    if (amount != null) effectiveOverrides[userId] = amount;
  }
  for (const userId of pinnedUserIds) {
    const amount = existingById.get(userId);
    if (amount != null) effectiveOverrides[userId] = amount;
  }
  for (const [userId, amount] of Object.entries(overrides)) {
    effectiveOverrides[userId] = amount;
  }

  return splitCostShares({
    totalMinor,
    participantIds,
    payerId,
    overrides: effectiveOverrides,
    splitRemainderEvenly,
  });
}

/** The per-head figure shown on a game card, minor units. */
export function perHeadAmountMinor(totalMinor: number, payerCount: number): number | null {
  if (!Number.isInteger(payerCount) || payerCount <= 0) return null;
  if (totalMinor <= 0) return null;
  return Math.round(totalMinor / payerCount);
}

/** Coins owed for a share, given the platform rate. `null` hides the option. */
export function coinsForShare(
  amountMinor: number,
  currency: PriceCurrency,
  coinsPerCurrencyUnit: number | null,
): number | null {
  if (coinsPerCurrencyUnit == null) return null;
  if (!Number.isFinite(coinsPerCurrencyUnit) || coinsPerCurrencyUnit <= 0) return null;
  if (amountMinor <= 0) return null;
  const major = amountMinor / currencyMinorFactor(currency);
  const coins = Math.ceil(major * coinsPerCurrencyUnit);
  return coins > 0 ? coins : null;
}

/** Why a share cannot be settled with in-app coins right now. */
export type CoinSettleRefusal =
  | 'COINS_UNAVAILABLE'
  | 'ALREADY_SETTLED'
  | 'NO_PAYER'
  | 'PAYER_CANNOT_PAY_SELF'
  | 'INSUFFICIENT_COINS';

export type CoinSettlePlan =
  | { ok: true; coins: number; payerId: string }
  | { ok: false; reason: CoinSettleRefusal };

/**
 * Everything that must be true before a single coin moves.
 *
 * Pure, so the refusal branches can be table-tested without a wallet. The
 * service calls this **before** `TransactionService.createTransaction` and
 * writes the paid timestamps only after the transfer returns, so a refusal can
 * never leave a share marked paid.
 */
export function planCoinSettlement(input: {
  viewerId: string;
  payerId: string | null;
  amountMinor: number;
  currency: PriceCurrency;
  /** `PlatformSetting.COINS_PER_CURRENCY_UNIT`; `null` hides the option. */
  coinsPerCurrencyUnit: number | null;
  viewerCoinBalance: number;
  alreadySettled: boolean;
}): CoinSettlePlan {
  if (input.alreadySettled) return { ok: false, reason: 'ALREADY_SETTLED' };
  if (input.payerId == null) return { ok: false, reason: 'NO_PAYER' };
  if (input.payerId === input.viewerId) {
    return { ok: false, reason: 'PAYER_CANNOT_PAY_SELF' };
  }

  const coins = coinsForShare(input.amountMinor, input.currency, input.coinsPerCurrencyUnit);
  if (coins == null) return { ok: false, reason: 'COINS_UNAVAILABLE' };
  if (input.viewerCoinBalance < coins) return { ok: false, reason: 'INSUFFICIENT_COINS' };

  return { ok: true, coins, payerId: input.payerId };
}

/** The `TRANSFER` row label the PRD fixes: `Game share · {gameName}`. */
export function buildCoinTransferLabel(gameName: string | null): string {
  const name = (gameName ?? '').trim();
  return name.length > 0 ? `Game share · ${name}` : 'Game share';
}

/** What the viewer sees on a share's chip. Derived, never stored. */
export type DerivedShareState = 'UNPAID' | 'MARKED_PAID' | 'SETTLED';

export function deriveShareState(
  share: { markedPaidAt: Date | null; confirmedAt: Date | null },
  isPayer: boolean,
): DerivedShareState {
  // The payer fronted the money, so there is nothing for them to settle.
  if (isPayer) return 'SETTLED';
  if (share.confirmedAt) return 'SETTLED';
  if (share.markedPaidAt) return 'MARKED_PAID';
  return 'UNPAID';
}

/**
 * Who the total is split between.
 *
 * Only `PLAYING` participants owe a share. Paying the club does not add a seat.
 * Ordered by join time so the rounding remainder lands deterministically even
 * when the payer is not playing.
 */
export function selectSplitParticipantIds(
  participants: readonly { userId: string; status: string; joinedAt: Date }[],
): string[] {
  const ordered = [...participants].sort(
    (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
  );
  const ids: string[] = [];
  for (const participant of ordered) {
    if (participant.status === 'PLAYING' && !ids.includes(participant.userId)) {
      ids.push(participant.userId);
    }
  }
  return ids;
}

/**
 * How many people the total is split by on a game **card**.
 *
 * While the shares are still estimated the card must answer "what will this cost
 * me if I join?", so the seat count wins over the (possibly tiny) current
 * roster. Once frozen the real number of shares is the only honest answer.
 */
export function resolvePerHeadPayerCount(input: {
  playingCount: number;
  maxParticipants: number | null;
  shareCount: number;
  frozen: boolean;
}): number {
  if (input.frozen && input.shareCount > 0) return input.shareCount;
  const seats = input.maxParticipants ?? 0;
  return Math.max(input.playingCount, seats, 1);
}

function dedupe(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
