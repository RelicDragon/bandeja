import api from './axios';
import type { PaymentMethodEntry } from '@shared/payments/paymentMethodSelection';
import type { BasicUser, PriceCurrency } from '@/types';

/**
 * PRD 348 — the cost split ledger.
 *
 * Mirrors `Backend/src/services/gameCost/gameCost.types.ts`. There is no
 * generated client, so changing one means changing the other in the same change.
 *
 * All money is **integer minor units** of `currency`, never converted.
 */

export type CostShareState = 'UNPAID' | 'MARKED_PAID' | 'SETTLED';
export type CostShareMethod = 'MANUAL' | 'COINS';

export interface CostShare {
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

export interface GameCostSummary {
  gameId: string;
  /** `false` when the game has no splittable price — render nothing at all. */
  available: boolean;
  totalMinor: number;
  currency: PriceCurrency | null;
  payerUserId: string | null;
  payer: BasicUser | null;
  /** Legacy one-line mirror of {@link paymentMethods}; prefer the list. */
  paymentHint: string | null;
  /** PRD 348 — up to 3 country-scoped ways to pay the payer back. */
  paymentMethods: PaymentMethodEntry[];
  /** ISO-2 of where the game is played; drives which methods the picker offers. */
  countryIso2: string | null;
  /** Set once the shares are frozen (the game reached a final result). */
  frozenAt: string | null;
  estimated: boolean;
  shares: CostShare[];
  settledCount: number;
  shareCount: number;
  outstandingMinor: number;
  viewerShare: CostShare | null;
  canManage: boolean;
  canConfirm: boolean;
  canRemind: boolean;
  /** `COINS_PER_CURRENCY_UNIT`; `null` hides every coin affordance. */
  coinsPerCurrencyUnit: number | null;
  viewerCoinCost: number | null;
  viewerCoinBalance: number | null;
  remindAvailableAt: string | null;
}

export interface OwedCostShare {
  gameId: string;
  gameName: string | null;
  startTime: string | null;
  amountMinor: number;
  currency: PriceCurrency;
  state: CostShareState;
  counterparty: BasicUser | null;
  counterpartyUserId: string | null;
}

export interface OwedSummary {
  owed: OwedCostShare[];
  owedToMe: OwedCostShare[];
}

export interface UpdateCostSharesInput {
  payerUserId?: string | null;
  /** `null` clears the list; omit to leave it alone. At most 3 entries. */
  paymentMethods?: PaymentMethodEntry[] | null;
  /** @deprecated Pre-catalogue free text; send `paymentMethods` instead. */
  paymentHint?: string | null;
  overrides?: { userId: string; amountMinor: number }[];
  splitRemainderEvenly?: boolean;
}

export interface RemindResult {
  sent: number;
  availableAt: string | null;
}

export const gameCostApi = {
  async getCostShares(gameId: string): Promise<GameCostSummary> {
    const response = await api.get<{ success: boolean; data: GameCostSummary }>(
      `/games/${gameId}/cost-shares`,
    );
    return response.data.data;
  },

  async updateCostShares(
    gameId: string,
    input: UpdateCostSharesInput,
  ): Promise<GameCostSummary> {
    const response = await api.put<{ success: boolean; data: GameCostSummary }>(
      `/games/${gameId}/cost-shares`,
      input,
    );
    return response.data.data;
  },

  async markMyShareAsPaid(
    gameId: string,
    method: CostShareMethod,
  ): Promise<GameCostSummary> {
    const response = await api.post<{ success: boolean; data: GameCostSummary }>(
      `/games/${gameId}/cost-shares/me/paid`,
      { method },
    );
    return response.data.data;
  },

  async confirmShare(
    gameId: string,
    userId: string,
    confirmed: boolean,
  ): Promise<GameCostSummary> {
    const response = await api.post<{ success: boolean; data: GameCostSummary }>(
      `/games/${gameId}/cost-shares/${userId}/confirm`,
      { confirmed },
    );
    return response.data.data;
  },

  async remindUnpaid(gameId: string): Promise<RemindResult> {
    const response = await api.post<{ success: boolean; data: RemindResult }>(
      `/games/${gameId}/cost-shares/remind`,
    );
    return response.data.data;
  },

  async getOwed(): Promise<OwedSummary> {
    const response = await api.get<{ success: boolean; data: OwedSummary }>(
      '/transactions/owed',
    );
    return response.data.data;
  },
};
