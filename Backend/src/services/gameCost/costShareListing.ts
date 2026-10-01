/**
 * Read-only, batched view of many cost ledgers for their organizers (agent `list_cost_shares`,
 * docs/plans/ai-agent-money.md slice 10h).
 *
 * Never calls {@link syncGameCostShares}: no row is created, updated or deleted, no payer is
 * stamped, nothing is frozen and nothing is emitted. Per game it returns what the stored
 * ledger holds, filtered the way the sync filters its result:
 *   - frozen: every stored row (the sync returns `existing` as is);
 *   - not frozen: the stored rows of the current split (PLAYING participants); a coin-paid
 *     row of a player who left (waiting for its refund) is nobody's share;
 *   - no stored rows: `projected`, the split the next sync would create, from the same pure
 *     math (`recomputeShares`), never stored. The 7-day guard applies: a FINAL game that ended
 *     more than 7 days ago without a ledger never gets one, so it is only counted (`tooOld`);
 *   - no splittable price (or PER_TEAM / FREE / no PLAYING player): not a ledger, skipped.
 *
 * Who sees a game: exactly the "every row" rule of `projectCostSummary`
 * (`canManageCostShares || canRemindCostShares` = payer, game owner/admin, a LEAGUE fixture's
 * season owner/admins, platform admin; the payer only while they may view the game at all).
 * Games failing it are dropped, not counted.
 */
import type { Prisma, PriceCurrency } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { deriveShareState, recomputeShares, resolveGameTotalMinor, selectSplitParticipantIds } from './costShareMath';
import { canManageCostShares, canRemindCostShares } from './costSharePermissions';
import {
  applySeasonCostPricing,
  buildActorContext,
  effectivePayerId,
  GAME_COST_SELECT,
  RETROACTIVE_LEDGER_MAX_AGE_MS,
  type GameCostRow,
} from './gameCost.service';
import type { CostShareState } from './gameCost.types';

export type ListedCostShare = {
  userId: string;
  amountMinor: number;
  currency: PriceCurrency;
  state: CostShareState;
  method: 'MANUAL' | 'COINS';
  markedPaidAt: Date | null;
  confirmedAt: Date | null;
  /** The payer's own row: settled by definition, nobody owes it. */
  isPayer: boolean;
};

export type ListedCostLedger = {
  gameId: string;
  name: string | null;
  entityType: string;
  clubName: string | null;
  /** `null` when the game has no time set. */
  startTime: Date | null;
  payerUserId: string | null;
  /** `split` = stored rows; `projected` = no rows yet, what the next sync would create (not stored). */
  ledger: 'split' | 'projected';
  frozen: boolean;
  /** The game's (or, for a NOT_KNOWN fixture, its season's) currency. */
  currency: PriceCurrency;
  shares: ListedCostShare[];
};

export type OrganizerCostLedgers = {
  ledgers: ListedCostLedger[];
  /** More candidate games than `maxGames`: the oldest (or latest, for `asc`) were not read. */
  truncated: boolean;
  /** FINAL games ended > 7 days ago with no ledger: they never get one. */
  tooOldCount: number;
};

const ORGANIZER_ROLES: Prisma.EnumParticipantRoleFilter = { in: ['OWNER', 'ADMIN'] };

/**
 * Prefilter of the games a user may organize (owner/admin, season owner/admin of a fixture,
 * stored payer). Narrows the query only; the per-game predicate decides.
 */
export function organizerCostGamesWhere(userId: string): Prisma.GameWhereInput {
  return {
    OR: [
      { participants: { some: { userId, role: ORGANIZER_ROLES } } },
      { costPayerId: userId },
      {
        entityType: 'LEAGUE',
        parent: { entityType: 'LEAGUE_SEASON', participants: { some: { userId, role: ORGANIZER_ROLES } } },
      },
    ],
  };
}

const LISTING_SELECT = {
  ...GAME_COST_SELECT,
  timeIsSet: true,
  club: { select: { name: true } },
  costShares: {
    select: {
      userId: true,
      amountCents: true,
      currency: true,
      markedPaidAt: true,
      confirmedAt: true,
      method: true,
      transactionId: true,
    },
  },
} as const;

type ListingRow = GameCostRow & {
  timeIsSet: boolean;
  club: { name: string } | null;
  costShares: {
    userId: string;
    amountCents: number;
    currency: string;
    markedPaidAt: Date | null;
    confirmedAt: Date | null;
    method: 'MANUAL' | 'COINS';
    transactionId: string | null;
  }[];
};

export async function listOrganizerCostLedgers(params: {
  actor: { id: string; isAdmin: boolean };
  where: Prisma.GameWhereInput;
  maxGames: number;
  order: 'asc' | 'desc';
  now: Date;
}): Promise<OrganizerCostLedgers> {
  const empty: OrganizerCostLedgers = { ledgers: [], truncated: false, tooOldCount: 0 };
  if (!config.costSplitEnabled) return empty;

  const rows = (await prisma.game.findMany({
    where: { AND: [params.where, { entityType: { not: 'LEAGUE_SEASON' } }] },
    select: LISTING_SELECT,
    orderBy: [{ startTime: params.order }, { id: 'asc' }],
    take: params.maxGames + 1,
  })) as unknown as ListingRow[];
  const truncated = rows.length > params.maxGames;

  const ledgers: ListedCostLedger[] = [];
  let tooOldCount = 0;
  for (const raw of rows.slice(0, params.maxGames)) {
    const game = applySeasonCostPricing(raw);
    // The same "sees every row" rule as `projectCostSummary` (the shares don't change it).
    const ctx = buildActorContext(game, game.costShares, params.actor);
    if (!(canManageCostShares(ctx) || canRemindCostShares(ctx))) continue;

    const participantIds = selectSplitParticipantIds(game.participants);
    const totalMinor = resolveGameTotalMinor({
      priceType: game.priceType,
      priceTotal: game.priceTotal,
      currency: game.priceCurrency,
      payerCount: participantIds.length,
    });
    if (totalMinor == null || game.priceCurrency == null) continue;

    const payerId = effectivePayerId(game);
    const frozen = game.costFrozenAt != null;
    const base = {
      gameId: game.id,
      name: game.name,
      entityType: game.entityType,
      clubName: game.club?.name ?? null,
      startTime: game.timeIsSet ? game.startTime : null,
      payerUserId: payerId,
      frozen,
      currency: game.priceCurrency,
    };

    if (game.costShares.length === 0) {
      // A frozen game without rows stays without a ledger (the sync returns the empty set).
      if (frozen) continue;
      const tooOld =
        game.resultsStatus === 'FINAL' &&
        game.endTime != null &&
        game.endTime.getTime() < params.now.getTime() - RETROACTIVE_LEDGER_MAX_AGE_MS;
      if (tooOld) {
        tooOldCount += 1;
        continue;
      }
      const projected = recomputeShares({ totalMinor, participantIds, payerId, existing: [], pinnedUserIds: [] });
      const currency = game.priceCurrency;
      ledgers.push({
        ...base,
        ledger: 'projected',
        shares: projected.map((row) => {
          const isPayer = row.userId === payerId;
          return {
            userId: row.userId,
            amountMinor: row.amountMinor,
            currency,
            state: isPayer ? 'SETTLED' : 'UNPAID',
            method: 'MANUAL',
            markedPaidAt: null,
            confirmedAt: null,
            isPayer,
          };
        }),
      });
      continue;
    }

    const inSplit = new Set(participantIds);
    const stored = frozen ? game.costShares : game.costShares.filter((row) => inSplit.has(row.userId));
    ledgers.push({
      ...base,
      ledger: 'split',
      shares: stored.map((row) => {
        const isPayer = payerId != null && row.userId === payerId;
        return {
          userId: row.userId,
          amountMinor: row.amountCents,
          currency: row.currency as PriceCurrency,
          state: deriveShareState(row, isPayer),
          method: row.method,
          markedPaidAt: row.markedPaidAt,
          confirmedAt: row.confirmedAt,
          isPayer,
        };
      }),
    });
  }
  return { ledgers, truncated, tooOldCount };
}
