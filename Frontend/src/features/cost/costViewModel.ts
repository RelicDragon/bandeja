import type { CostShare, GameCostSummary } from '@/api/gameCost';

/**
 * PRD 348 — the decisions the Cost card makes, as pure functions.
 *
 * Kept out of the components so "is the coins option offered?" and "which row
 * goes first?" can be unit-tested without rendering anything.
 */

export type CoinOffer =
  | { available: false; coins: null; balance: number }
  | { available: true; coins: number; balance: number };

/**
 * Whether the settle sheet may show **Send N coins**.
 *
 * Three independent gates, all of which must hold: the platform rate exists
 * (`COINS_PER_CURRENCY_UNIT` is deliberately unset by default, which hides the
 * option everywhere), the backend worked out a coin price, and the viewer can
 * actually afford it.
 */
export function canOfferCoinSettlement(summary: GameCostSummary): CoinOffer {
  const balance = summary.viewerCoinBalance ?? 0;
  const coins = summary.viewerCoinCost;
  if (summary.coinsPerCurrencyUnit == null) return { available: false, coins: null, balance };
  if (coins == null || coins <= 0) return { available: false, coins: null, balance };
  if (balance < coins) return { available: false, coins: null, balance };
  return { available: true, coins, balance };
}

/** The viewer's own row is pinned to the top; everyone else keeps roster order. */
export function orderCostShares(
  shares: readonly CostShare[],
  viewerUserId: string | null | undefined,
): CostShare[] {
  if (!viewerUserId) return [...shares];
  const mine = shares.filter((share) => share.userId === viewerUserId);
  const others = shares.filter((share) => share.userId !== viewerUserId);
  return [...mine, ...others];
}

/** `true` when the whole feature must render nothing for this game. */
export function isCostLedgerHidden(summary: GameCostSummary | undefined): boolean {
  if (!summary) return true;
  if (!summary.available) return true;
  if (summary.currency == null) return true;
  if (summary.totalMinor <= 0) return true;
  return summary.shares.length === 0;
}

/** The payer / organizer strip: "3 of 4 settled · 10 € outstanding". */
export function summariseSettlement(summary: GameCostSummary): {
  settled: number;
  total: number;
  outstandingMinor: number;
  allSettled: boolean;
} {
  return {
    settled: summary.settledCount,
    total: summary.shareCount,
    outstandingMinor: summary.outstandingMinor,
    allSettled: summary.shareCount > 0 && summary.settledCount >= summary.shareCount,
  };
}

/** Which card the viewer is looking at. */
export type ViewerCostRole = 'PAYER' | 'DEBTOR' | 'OBSERVER';

export function viewerCostRole(
  summary: GameCostSummary,
  viewerUserId: string | null | undefined,
): ViewerCostRole {
  if (!viewerUserId) return 'OBSERVER';
  if (summary.payerUserId === viewerUserId) return 'PAYER';
  if (summary.viewerShare && summary.viewerShare.userId === viewerUserId) return 'DEBTOR';
  return 'OBSERVER';
}

/**
 * The wide button under the list.
 *
 * `SETTLE` = "I paid", `SETTLED` = the disabled "Settled" confirmation, `NONE` =
 * no button at all, which is what the payer and a bystander see: the payer has
 * nothing to settle with themselves.
 */
export function viewerPrimaryAction(
  summary: GameCostSummary,
  viewerUserId: string | null | undefined,
): 'SETTLE' | 'SETTLED' | 'NONE' {
  if (viewerCostRole(summary, viewerUserId) !== 'DEBTOR') return 'NONE';
  const share = summary.viewerShare;
  if (!share) return 'NONE';
  return share.state === 'SETTLED' ? 'SETTLED' : 'SETTLE';
}

/** Milliseconds until the organizer may nudge again, or `0` when they may now. */
export function remindCooldownMs(
  remindAvailableAt: string | null,
  nowMs: number = Date.now(),
): number {
  if (!remindAvailableAt) return 0;
  const at = Date.parse(remindAvailableAt);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, at - nowMs);
}

/**
 * Splitting a total evenly in the **override sheet's** preview.
 *
 * Mirrors the backend's rule — everyone gets `floor(target / n)` and the payer
 * absorbs the remainder — so the preview cannot disagree with what is saved.
 */
export function previewEvenSplit(
  totalMinor: number,
  userIds: readonly string[],
  payerId: string | null,
  overrides: Readonly<Record<string, number>>,
): Record<string, number> {
  const fixed = new Map<string, number>();
  for (const id of userIds) {
    const value = overrides[id];
    if (value != null && Number.isFinite(value)) fixed.set(id, Math.max(0, Math.round(value)));
  }
  const free = userIds.filter((id) => !fixed.has(id));
  const out: Record<string, number> = {};
  for (const [id, value] of fixed) out[id] = value;
  if (free.length === 0) return out;

  let fixedSum = 0;
  for (const value of fixed.values()) fixedSum += value;
  const target = Math.max(0, Math.trunc(totalMinor) - fixedSum);
  const base = Math.floor(target / free.length);
  const remainder = target - base * free.length;
  const holder = payerId != null && free.includes(payerId) ? payerId : free[0];
  for (const id of free) out[id] = base + (id === holder ? remainder : 0);
  return out;
}

/** Gate mounting as well as fetching, so unauthorized viewers see no error card. */
export function canViewGameCost(
  game: {
    entityType: string;
    participants: readonly { userId: string; status: string; role: string }[];
  },
  viewer: { id: string; isAdmin?: boolean } | null | undefined,
): boolean {
  if (!viewer || game.entityType === 'LEAGUE_SEASON') return false;
  return Boolean(viewer.isAdmin) || game.participants.some(
    (participant) => participant.userId === viewer.id && (
      participant.status === 'PLAYING' ||
      participant.role === 'OWNER' ||
      participant.role === 'ADMIN'
    ),
  );
}
