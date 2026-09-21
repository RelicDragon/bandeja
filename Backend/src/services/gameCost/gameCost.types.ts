import type { CostShareMethod, PriceCurrency } from '@prisma/client';
import type { PaymentMethodEntry } from '@bandeja/shared/payments/paymentMethodSelection';
import type { BasicUser } from '../../types/user.types';

/**
 * PRD 348 — wire shapes for `/api/games/:id/cost-shares` and
 * `/api/transactions/owed`.
 *
 * Mirrored on the frontend by `Frontend/src/api/gameCost.ts`. There is no
 * generated client, so changing one means changing the other in the same change.
 *
 * All money is **integer minor units** of `currency` (cents / fils / yen) and
 * is never converted between currencies.
 */

/** What the viewer sees on a share's chip. */
export type CostShareState = 'UNPAID' | 'MARKED_PAID' | 'SETTLED';

export interface CostShareDto {
  userId: string;
  user: BasicUser | null;
  amountMinor: number;
  currency: PriceCurrency;
  state: CostShareState;
  markedPaidAt: string | null;
  confirmedAt: string | null;
  method: CostShareMethod;
  transactionId: string | null;
  /** This row belongs to whoever fronted the money. */
  isPayer: boolean;
  /** The amount differs from the even split (an organizer edited it). */
  isOverridden: boolean;
}

export interface GameCostSummaryDto {
  gameId: string;
  /** `false` when the game has no splittable price — render nothing at all. */
  available: boolean;
  totalMinor: number;
  currency: PriceCurrency | null;
  payerUserId: string | null;
  payer: BasicUser | null;
  /**
   * Legacy one-line form of {@link paymentMethods}, still sent for app builds
   * shipped before the catalogue. New clients render `paymentMethods`.
   */
  paymentHint: string | null;
  /** How to pay the payer back: at most 3 entries, `CUSTOM` included. */
  paymentMethods: PaymentMethodEntry[];
  /**
   * ISO-2 of the country the game is played in, so the picker can offer the
   * rails that exist there. `null` when the city has no usable country code.
   */
  countryIso2: string | null;
  /** Set once the shares are frozen (the game reached a final result). */
  frozenAt: string | null;
  /** `true` while the shares can still move — mirrors `PerHeadPrice.estimated`. */
  estimated: boolean;
  shares: CostShareDto[];
  settledCount: number;
  shareCount: number;
  /** Sum of every share that is not yet confirmed by the payer. */
  outstandingMinor: number;
  viewerShare: CostShareDto | null;
  canManage: boolean;
  canConfirm: boolean;
  canRemind: boolean;
  /** `COINS_PER_CURRENCY_UNIT`; `null` hides every coin affordance. */
  coinsPerCurrencyUnit: number | null;
  /** Coins the viewer would send to settle their own share; `null` when unavailable. */
  viewerCoinCost: number | null;
  /** The viewer's coin balance, so the sheet can hide an unaffordable option. */
  viewerCoinBalance: number | null;
  /** ISO timestamp the organizer may nudge again, or `null` when they may now. */
  remindAvailableAt: string | null;
}

/** One row of the Wallet "Owed" / "Owed to you" lists. */
export interface OwedCostShareDto {
  gameId: string;
  gameName: string | null;
  startTime: string | null;
  amountMinor: number;
  currency: PriceCurrency;
  state: CostShareState;
  /** The other side of the debt: the payer for "Owed", the debtor for "Owed to you". */
  counterparty: BasicUser | null;
  counterpartyUserId: string | null;
}

export interface OwedSummaryDto {
  /** Shares the viewer still owes somebody. */
  owed: OwedCostShareDto[];
  /** Shares other people still owe the viewer, because the viewer is the payer. */
  owedToMe: OwedCostShareDto[];
}

export interface UpdateCostSharesInput {
  /** `null` clears the payer; `undefined` leaves it alone. */
  payerUserId?: string | null;
  /**
   * `null` clears the list; `undefined` leaves it alone. At most
   * `MAX_PAYMENT_METHODS` entries. Writing this also refreshes the legacy
   * `Game.paymentHint` mirror.
   */
  paymentMethods?: PaymentMethodEntry[] | null;
  /**
   * Legacy free-text hint from pre-catalogue clients; stored as a single
   * `CUSTOM` entry. Ignored when `paymentMethods` is present.
   */
  paymentHint?: string | null;
  /** Per-player fixed amounts in minor units. */
  overrides?: { userId: string; amountMinor: number }[];
  /** Default `true` — the other players absorb the difference. */
  splitRemainderEvenly?: boolean;
}
