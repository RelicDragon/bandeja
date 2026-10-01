import type { Prisma, PriceCurrency, PriceType, ParticipantRole } from '@prisma/client';
import {
  resolvePaymentMethods,
  type PaymentMethodEntry,
} from '@bandeja/shared/payments/paymentMethodSelection';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { iso2FromCityCountry } from '../../utils/currencyFromCountry';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { projectEmbeddedUserByPrimarySport } from '../user/projectEmbeddedBasicUsers';
import { emitGameCostUpdated } from '../socketEmitFacade';
import { getNumericSetting, PLATFORM_SETTING_KEYS } from '../platformSetting.service';
import { createGuardedTransfer } from '../transaction.service';
import {
  buildCoinTransferLabel,
  coinsForShare,
  deriveShareState,
  perHeadAmountMinor,
  planCoinSettlement,
  recomputeShares,
  resolveGameTotalMinor,
  selectSplitParticipantIds,
  type CoinSettleRefusal,
} from './costShareMath';
import { resolvePaymentMethodWrite } from './paymentMethodsWrite';
import { projectCostSummary } from './costSummaryProjection';
import {
  canConfirmCostShare,
  canManageCostShares,
  canMarkOwnCostSharePaid,
  canRemindCostShares,
  canViewCostShares,
  type CostShareActorContext,
} from './costSharePermissions';
import type { BasicUser } from '../../types/user.types';
import { reverseOrphanedCoinShares } from './coinShareReversal';
import type {
  CostShareDto,
  GameCostSummaryDto,
  OwedCostShareDto,
  OwedSummaryDto,
  UpdateCostSharesInput,
} from './gameCost.types';

/**
 * PRD 348 — the cost split ledger.
 *
 * A game's shares are **derived state**: {@link syncGameCostShares} rebuilds them
 * from the roster every time the ledger is read or written, so no roster mutation
 * path has to remember to call anything. Once `Game.costFrozenAt` is set the
 * amounts stop moving (PRD: "shares fixed at final score").
 *
 * No money moves here. The one exception is {@link markOwnShareAsPaid} with
 * `method: 'COINS'`, which claims the share row and then delegates to
 * `createGuardedTransfer` in `transaction.service.ts` — there is no payment
 * provider anywhere in this file.
 *
 * All amounts are **integer minor units** of the game's own currency.
 */

/**
 * Upper bound for an organizer's per-player override, in minor units
 * (1,000,000 major units — far past any real court fee).
 *
 * `GameCostShare.amountCents` is a Postgres `int4`; without this an override of
 * `1e15` reaches Prisma and answers 500 instead of 400, and anything under
 * 2^31 would be stored and rendered as a real share.
 */
export const COST_SHARE_MAX_AMOUNT_MINOR = 100_000_000;

/** Manual "Remind unpaid" may be used at most once per this window, per game. */
export const COST_REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** A FINAL game without a ledger older than this never gets one (matches the auto-remind window). */
export const RETROACTIVE_LEDGER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type GameCostRow = {
  id: string;
  entityType: string;
  name: string | null;
  startTime: Date | null;
  endTime: Date | null;
  priceType: PriceType;
  priceTotal: number | null;
  priceCurrency: PriceCurrency | null;
  costPayerId: string | null;
  paymentHint: string | null;
  paymentMethods: Prisma.JsonValue | null;
  city: { country: string | null } | null;
  costFrozenAt: Date | null;
  resultsStatus: 'NONE' | 'IN_PROGRESS' | 'FINAL';
  participants: {
    userId: string;
    status: string;
    role: string;
    joinedAt: Date;
  }[];
  /** Set for LEAGUE fixtures: the season hub whose owner/admins organize it. */
  parent: {
    entityType: string;
    priceType: PriceType;
    priceTotal: number | null;
    priceCurrency: PriceCurrency | null;
    paymentHint: string | null;
    paymentMethods: Prisma.JsonValue | null;
    participants: { userId: string; role: string }[];
  } | null;
};

type ShareRow = {
  userId: string;
  amountCents: number;
  currency: string;
  markedPaidAt: Date | null;
  confirmedAt: Date | null;
  method: 'MANUAL' | 'COINS';
  transactionId: string | null;
};

export const GAME_COST_SELECT = {
  id: true,
  entityType: true,
  name: true,
  startTime: true,
  endTime: true,
  priceType: true,
  priceTotal: true,
  priceCurrency: true,
  costPayerId: true,
  paymentHint: true,
  paymentMethods: true,
  // PRD 348 — the picker offers the rails that exist where the game is played.
  city: { select: { country: true } },
  costFrozenAt: true,
  resultsStatus: true,
  participants: {
    select: { userId: true, status: true, role: true, joinedAt: true },
  },
  parent: {
    select: {
      entityType: true,
      priceType: true,
      priceTotal: true,
      priceCurrency: true,
      paymentHint: true,
      paymentMethods: true,
      participants: {
        where: { role: { in: ['OWNER', 'ADMIN'] as ParticipantRole[] } },
        select: { userId: true, role: true },
      },
    },
  },
} as const;

/**
 * PRD 348 — the structured list, falling back to the pre-catalogue free-text
 * hint read as a single `CUSTOM` entry.
 */
function gamePaymentMethods(game: GameCostRow): PaymentMethodEntry[] {
  return resolvePaymentMethods(game.paymentMethods, game.paymentHint);
}

function gameCountryIso2(game: GameCostRow): string | null {
  return iso2FromCityCountry(game.city?.country) ?? null;
}

/** A LEAGUE fixture is organized by its season's owner/admins, not its own roster. */
function seasonOrganizers(game: GameCostRow): { userId: string; role: string }[] {
  if (game.entityType !== 'LEAGUE' || game.parent?.entityType !== 'LEAGUE_SEASON') return [];
  return game.parent.participants.filter((p) => p.role === 'OWNER' || p.role === 'ADMIN');
}

function ownerUserId(game: GameCostRow): string | null {
  return (
    game.participants.find((p) => p.role === 'OWNER')?.userId ??
    seasonOrganizers(game).find((p) => p.role === 'OWNER')?.userId ??
    null
  );
}

/** `Game.costPayerId` when set, otherwise the owner (the season owner for a LEAGUE fixture). */
export function effectivePayerId(game: GameCostRow): string | null {
  return game.costPayerId ?? ownerUserId(game);
}

/**
 * League seasons carry the price (e.g. PER_PERSON per fixture) while fixtures are
 * created `NOT_KNOWN`. Such a fixture splits by its season's price and offers the
 * season's payment methods; a fixture priced on its own keeps its own.
 */
export function applySeasonCostPricing<T extends Pick<
  GameCostRow,
  'entityType' | 'priceType' | 'priceTotal' | 'priceCurrency' | 'paymentHint' | 'paymentMethods' | 'parent'
>>(game: T): T {
  const season = game.parent;
  if (game.entityType !== 'LEAGUE' || season?.entityType !== 'LEAGUE_SEASON') return game;
  if (game.priceType === 'NOT_KNOWN') {
    game.priceType = season.priceType;
    game.priceTotal = season.priceTotal;
    game.priceCurrency = season.priceCurrency;
  }
  if (game.paymentMethods == null && !game.paymentHint) {
    game.paymentMethods = season.paymentMethods;
    game.paymentHint = season.paymentHint;
  }
  return game;
}

async function loadGame(gameId: string): Promise<GameCostRow | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: GAME_COST_SELECT,
  });
  return game ? applySeasonCostPricing(game as unknown as GameCostRow) : null;
}

function isCoinSettled(row: Pick<ShareRow, 'method' | 'transactionId'>): boolean {
  return row.method === 'COINS' && row.transactionId != null;
}

/**
 * Rebuild `GameCostShare` for a game from its current roster.
 *
 * Idempotent and safe to call from any read path. Returns the rows that now
 * exist, or `null` when the game has no splittable price (the whole feature is
 * hidden for that game).
 */
export async function syncGameCostShares(
  gameId: string,
  options: { emit?: boolean } = {},
): Promise<{ game: GameCostRow; shares: ShareRow[] } | null> {
  if (!config.costSplitEnabled) return null;

  const game = await loadGame(gameId);
  if (!game || game.entityType === 'LEAGUE_SEASON') return null;

  const existing = (await prisma.gameCostShare.findMany({
    where: { gameId },
    select: {
      userId: true,
      amountCents: true,
      currency: true,
      markedPaidAt: true,
      confirmedAt: true,
      method: true,
      transactionId: true,
    },
  })) as unknown as ShareRow[];

  const payerId = effectivePayerId(game);
  const participantIds = selectSplitParticipantIds(game.participants);
  const totalMinor = resolveGameTotalMinor({
    priceType: game.priceType,
    priceTotal: game.priceTotal,
    currency: game.priceCurrency,
    payerCount: participantIds.length,
  });

  const coinLabel = game.name?.trim() || gameId;

  // Nothing to split: drop any stale rows left behind by a price edit. Coins
  // already paid go back to the player rather than vanishing with the row.
  if (totalMinor == null || game.priceCurrency == null) {
    if (existing.length > 0) {
      await prisma.gameCostShare.deleteMany({ where: { gameId, transactionId: null } });
      const paidInCoins = existing.filter(isCoinSettled).map((row) => row.userId);
      await reverseOrphanedCoinShares(gameId, paidInCoins, coinLabel);
      if (options.emit !== false) await emitGameCostUpdated(gameId);
    }
    return { game, shares: [] };
  }

  // Never open a ledger retroactively on a game that finished long ago (e.g. a
  // past league season whose fixtures only now inherit the season price):
  // freezing it now would put stale debts in Wallets and nudge players 24 h later.
  if (
    existing.length === 0 &&
    game.costFrozenAt == null &&
    game.resultsStatus === 'FINAL' &&
    game.endTime != null &&
    game.endTime.getTime() < Date.now() - RETROACTIVE_LEDGER_MAX_AGE_MS
  ) {
    return { game, shares: [] };
  }

  // Persist the implicit payer once, so every other query can read one column.
  if (game.costPayerId == null && payerId != null) {
    await prisma.game.update({ where: { id: gameId }, data: { costPayerId: payerId } });
    game.costPayerId = payerId;
  }

  const frozen = game.costFrozenAt != null;
  const shouldFreezeNow = !frozen && game.resultsStatus === 'FINAL';

  if (frozen) {
    return { game, shares: existing };
  }

  const currency = game.priceCurrency;
  const next = recomputeShares({
    totalMinor,
    participantIds,
    payerId,
    existing: existing.map((row) => ({ userId: row.userId, amountMinor: row.amountCents })),
    // A share already settled in coins must never move: that money is gone.
    pinnedUserIds: existing.filter(isCoinSettled).map((row) => row.userId),
  });

  const nextById = new Map(next.map((row) => [row.userId, row.amountMinor]));
  const existingById = new Map(existing.map((row) => [row.userId, row]));

  const dropped = existing.filter((row) => !nextById.has(row.userId));
  const toDelete = dropped.filter((row) => !isCoinSettled(row)).map((r) => r.userId);
  // A player who paid in coins and then left the split (leave, kick, back to
  // the queue) is refunded payer → player. Until that succeeds the row stays,
  // outside the split and hidden below, so the payment is never lost.
  const toRefund = dropped.filter(isCoinSettled).map((r) => r.userId);
  const toCreate = next.filter((row) => !existingById.has(row.userId));
  const toUpdate = next.filter((row) => {
    const previous = existingById.get(row.userId);
    return (
      previous != null &&
      (previous.amountCents !== row.amountMinor || previous.currency !== currency)
    );
  });

  const changed =
    toDelete.length > 0 ||
    toRefund.length > 0 ||
    toCreate.length > 0 ||
    toUpdate.length > 0 ||
    shouldFreezeNow;

  if (changed) {
    await prisma.$transaction(async (tx) => {
      if (toDelete.length > 0) {
        // `transactionId: null`: a settle that stamped the row since our read
        // turned it into a coin payment, which only the reversal may remove.
        await tx.gameCostShare.deleteMany({
          where: { gameId, userId: { in: toDelete }, transactionId: null },
        });
      }
      for (const row of toCreate) {
        await tx.gameCostShare.create({
          data: {
            gameId,
            userId: row.userId,
            amountCents: row.amountMinor,
            currency,
          },
        });
      }
      for (const row of toUpdate) {
        await tx.gameCostShare.update({
          where: { gameId_userId: { gameId, userId: row.userId } },
          data: { amountCents: row.amountMinor, currency },
        });
      }
      if (shouldFreezeNow) {
        await tx.game.update({ where: { id: gameId }, data: { costFrozenAt: new Date() } });
      }
    });

    if (toRefund.length > 0) await reverseOrphanedCoinShares(gameId, toRefund, coinLabel);

    if (shouldFreezeNow) game.costFrozenAt = new Date();
    if (options.emit !== false) await emitGameCostUpdated(gameId);
  }

  const shares = await prisma.gameCostShare.findMany({
    where: { gameId },
    select: {
      userId: true,
      amountCents: true,
      currency: true,
      markedPaidAt: true,
      confirmedAt: true,
      method: true,
      transactionId: true,
    },
  });

  // Rows outside the split are coin payments still waiting for their refund;
  // they are not anybody's share of this game.
  const current = shares.filter((row) => nextById.has(row.userId));
  return { game, shares: current as unknown as ShareRow[] };
}

/**
 * Move a share — and whether it was paid — to the player who took the seat.
 *
 * Called from `participantSubstitution.service.ts`. Runs before the roster sync
 * so {@link syncGameCostShares} sees the substitute already holding the row.
 *
 * A share paid **in coins** does not move: those are the outgoing player's
 * coins, and handing the row over would seat the substitute on them. The sync
 * refunds the outgoing player like any leave (or keeps the refund claim until
 * the payer can cover it) and gives the substitute an ordinary unpaid share.
 */
export async function transferCostShareOnSubstitution(
  gameId: string,
  outUserId: string,
  inUserId: string,
): Promise<void> {
  if (!config.costSplitEnabled) return;
  if (outUserId === inUserId) return;

  const outgoing = await prisma.gameCostShare.findUnique({
    where: { gameId_userId: { gameId, userId: outUserId } },
  });
  if (!outgoing) return;
  if (isCoinSettled(outgoing)) {
    await syncGameCostShares(gameId);
    return;
  }

  const incoming = await prisma.gameCostShare.findUnique({
    where: { gameId_userId: { gameId, userId: inUserId } },
    select: { userId: true },
  });

  await prisma.$transaction(async (tx) => {
    if (incoming) {
      // The substitute somehow already had a row; the seat's row wins.
      await tx.gameCostShare.delete({
        where: { gameId_userId: { gameId, userId: inUserId } },
      });
    }
    await tx.gameCostShare.update({
      where: { gameId_userId: { gameId, userId: outUserId } },
      data: { userId: inUserId },
    });
  });

  await emitGameCostUpdated(gameId);
}

type ActorRow = { id: string; isAdmin: boolean; wallet: number };

async function loadActor(userId: string): Promise<ActorRow> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true, wallet: true },
  });
  if (!user) throw new ApiError(404, 'errors.users.notFound');
  return user;
}

export function buildActorContext(
  game: GameCostRow,
  shares: readonly Pick<ShareRow, 'userId'>[],
  actor: Pick<ActorRow, 'id' | 'isAdmin'>,
): CostShareActorContext {
  const owner = ownerUserId(game);
  const adminIds = [
    ...game.participants.filter((p) => p.role === 'ADMIN').map((p) => p.userId),
    // Season owner/admins manage every fixture's ledger like its own organizers.
    ...seasonOrganizers(game).map((p) => p.userId).filter((id) => id !== owner),
  ];
  return {
    entityType: game.entityType,
    userId: actor.id,
    isPlatformAdmin: actor.isAdmin,
    gameOwnerUserId: owner,
    gameAdminUserIds: [...new Set(adminIds)],
    payerUserId: effectivePayerId(game),
    playingUserIds: game.participants.filter((p) => p.status === 'PLAYING').map((p) => p.userId),
    shareUserIds: shares.map((row) => row.userId),
  };
}

function unavailableSummary(gameId: string): GameCostSummaryDto {
  return {
    gameId,
    available: false,
    totalMinor: 0,
    currency: null,
    payerUserId: null,
    payer: null,
    paymentHint: null,
    paymentMethods: [],
    countryIso2: null,
    frozenAt: null,
    estimated: true,
    shares: [],
    settledCount: 0,
    shareCount: 0,
    outstandingMinor: 0,
    viewerShare: null,
    canManage: false,
    canConfirm: false,
    canRemind: false,
    coinsPerCurrencyUnit: null,
    viewerCoinCost: null,
    viewerCoinBalance: null,
    remindAvailableAt: null,
  };
}

type ProjectedBasicUser = BasicUser & Record<string, unknown>;

async function loadBasicUsers(
  userIds: readonly string[],
): Promise<Map<string, ProjectedBasicUser>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: USER_SELECT_WITH_SPORT_PROFILES,
  });
  return new Map(
    users.map((user) => [
      user.id,
      projectEmbeddedUserByPrimarySport(user) as unknown as ProjectedBasicUser,
    ]),
  );
}

async function buildSummary(
  game: GameCostRow,
  shares: readonly ShareRow[],
  actor: ActorRow,
  remindAvailableAt: Date | null,
): Promise<GameCostSummaryDto> {
  const currency = game.priceCurrency;
  if (currency == null || shares.length === 0) {
    const empty = unavailableSummary(game.id);
    return {
      ...empty,
      available: false,
      paymentHint: game.paymentHint,
      paymentMethods: gamePaymentMethods(game),
      countryIso2: gameCountryIso2(game),
    };
  }

  const payerId = effectivePayerId(game);
  const userMap = await loadBasicUsers([...shares.map((s) => s.userId), payerId ?? '']);

  const totalMinor = shares.reduce((sum, row) => sum + row.amountCents, 0);

  const dtos: CostShareDto[] = shares.map((row) => {
    const isPayer = payerId != null && row.userId === payerId;
    return {
      userId: row.userId,
      user: userMap.get(row.userId) ?? null,
      amountMinor: row.amountCents,
      currency: row.currency as PriceCurrency,
      state: deriveShareState(row, isPayer),
      markedPaidAt: row.markedPaidAt ? row.markedPaidAt.toISOString() : null,
      confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
      method: row.method,
      transactionId: row.transactionId,
      isPayer,
      isOverridden: false,
    };
  });

  const evenShare = perHeadAmountMinor(totalMinor, dtos.length);
  for (const dto of dtos) {
    dto.isOverridden = evenShare != null && Math.abs(dto.amountMinor - evenShare) > 1;
  }

  const ctx = buildActorContext(game, shares, actor);
  const viewerShare = dtos.find((dto) => dto.userId === actor.id) ?? null;

  const coinsPerCurrencyUnit = await getNumericSetting(
    PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT,
  );
  const viewerCoinCost =
    viewerShare && !viewerShare.isPayer && viewerShare.state !== 'SETTLED'
      ? coinsForShare(viewerShare.amountMinor, currency, coinsPerCurrencyUnit)
      : null;

  const outstanding = dtos.filter((dto) => dto.state !== 'SETTLED');

  return projectCostSummary({
    gameId: game.id,
    available: true,
    totalMinor,
    currency,
    payerUserId: payerId,
    payer: payerId ? userMap.get(payerId) ?? null : null,
    paymentHint: game.paymentHint,
    paymentMethods: gamePaymentMethods(game),
    countryIso2: gameCountryIso2(game),
    frozenAt: game.costFrozenAt ? game.costFrozenAt.toISOString() : null,
    estimated: game.costFrozenAt == null,
    shares: dtos,
    settledCount: dtos.length - outstanding.length,
    shareCount: dtos.length,
    outstandingMinor: outstanding.reduce((sum, dto) => sum + dto.amountMinor, 0),
    viewerShare,
    canManage: canManageCostShares(ctx),
    canConfirm: canRemindCostShares(ctx),
    canRemind: canRemindCostShares(ctx) && outstanding.length > 0,
    coinsPerCurrencyUnit,
    viewerCoinCost,
    viewerCoinBalance: actor.wallet,
    remindAvailableAt: remindAvailableAt ? remindAvailableAt.toISOString() : null,
  }, ctx);
}

export async function requireLedger(
  gameId: string,
  actorId: string,
  options: { emit?: boolean } = {},
) {
  if (!config.costSplitEnabled) throw new ApiError(404, 'errors.games.notFound');

  // Authorize *before* syncing: `syncGameCostShares` writes rows, stamps
  // `Game.costPayerId` and emits into the game room, and a stranger must not be
  // able to trigger any of that on a game they have no relationship to.
  const game = await loadGame(gameId);
  if (!game || game.entityType === 'LEAGUE_SEASON') throw new ApiError(404, 'errors.games.notFound');
  const actor = await loadActor(actorId);
  const preCtx = buildActorContext(game, [], actor);
  if (!canViewCostShares(preCtx)) throw new ApiError(403, 'errors.games.accessDenied');

  const synced = await syncGameCostShares(gameId, options);
  if (!synced) throw new ApiError(404, 'errors.games.notFound');
  const ctx = buildActorContext(synced.game, synced.shares, actor);
  if (!canViewCostShares(ctx)) throw new ApiError(403, 'errors.games.accessDenied');
  return { ...synced, actor, ctx };
}

export async function getGameCostSummary(
  gameId: string,
  actorId: string,
  remindAvailableAt: Date | null = null,
): Promise<GameCostSummaryDto> {
  if (!config.costSplitEnabled) return unavailableSummary(gameId);
  const { game, shares, actor } = await requireLedger(gameId, actorId);
  return buildSummary(game, shares, actor, remindAvailableAt);
}

/** Owner / game admin / platform staff: payer, payment hint and per-player overrides. */
export async function updateGameCostShares(
  gameId: string,
  actorId: string,
  input: UpdateCostSharesInput,
): Promise<GameCostSummaryDto> {
  if (!config.costSplitEnabled) throw new ApiError(404, 'errors.games.notFound');

  const { game, shares, actor, ctx } = await requireLedger(gameId, actorId);
  if (!canManageCostShares(ctx)) throw new ApiError(403, 'errors.games.accessDenied');
  if (game.costFrozenAt != null) throw new ApiError(400, 'errors.cost.sharesFrozen');

  const gameUpdate: Prisma.GameUpdateInput = {};

  if (input.payerUserId !== undefined) {
    if (input.payerUserId === null) {
      gameUpdate.costPayer = { disconnect: true };
    } else {
      const onRoster =
        game.participants.some((p) => p.userId === input.payerUserId) ||
        seasonOrganizers(game).some((p) => p.userId === input.payerUserId);
      if (!onRoster) throw new ApiError(400, 'errors.cost.payerNotOnRoster');
      gameUpdate.costPayer = { connect: { id: input.payerUserId } };
    }
  }

  const paymentWrite = resolvePaymentMethodWrite(input);
  if (paymentWrite) {
    gameUpdate.paymentMethods = paymentWrite.paymentMethods;
    gameUpdate.paymentHint = paymentWrite.paymentHint;
  }

  if (Object.keys(gameUpdate).length > 0) {
    await prisma.game.update({ where: { id: gameId }, data: gameUpdate });
  }

  if (input.overrides && input.overrides.length > 0) {
    const shareUserIds = new Set(shares.map((row) => row.userId));
    const overrides: Record<string, number> = {};
    for (const override of input.overrides) {
      if (!shareUserIds.has(override.userId)) {
        throw new ApiError(400, 'errors.cost.shareNotFound');
      }
      if (
        !Number.isFinite(override.amountMinor) ||
        override.amountMinor < 0 ||
        override.amountMinor > COST_SHARE_MAX_AMOUNT_MINOR
      ) {
        throw new ApiError(400, 'errors.cost.invalidAmount');
      }
      overrides[override.userId] = Math.round(override.amountMinor);
    }

    const refreshed = await loadGame(gameId);
    if (!refreshed || refreshed.priceCurrency == null) {
      throw new ApiError(400, 'errors.cost.notAvailable');
    }
    const payerId = effectivePayerId(refreshed);
    const participantIds = selectSplitParticipantIds(refreshed.participants);
    const totalMinor = resolveGameTotalMinor({
      priceType: refreshed.priceType,
      priceTotal: refreshed.priceTotal,
      currency: refreshed.priceCurrency,
      payerCount: participantIds.length,
    });
    if (totalMinor == null) throw new ApiError(400, 'errors.cost.notAvailable');

    const next = recomputeShares({
      totalMinor,
      participantIds,
      payerId,
      existing: shares.map((row) => ({ userId: row.userId, amountMinor: row.amountCents })),
      pinnedUserIds: shares.filter(isCoinSettled).map((row) => row.userId),
      overrides,
      splitRemainderEvenly: input.splitRemainderEvenly !== false,
    });

    // Upsert, not update: someone may have joined between the sync above and
    // here, and a missing row must not roll the organizer's edit back.
    await prisma.$transaction(
      next.map((row) =>
        prisma.gameCostShare.upsert({
          where: { gameId_userId: { gameId, userId: row.userId } },
          update: { amountCents: row.amountMinor },
          create: {
            gameId,
            userId: row.userId,
            amountCents: row.amountMinor,
            currency: refreshed.priceCurrency as string,
          },
        }),
      ),
    );
  }

  await emitGameCostUpdated(gameId);

  const synced = await syncGameCostShares(gameId, { emit: false });
  if (!synced) throw new ApiError(404, 'errors.games.notFound');
  return buildSummary(synced.game, synced.shares, actor, null);
}

export type MarkPaidMethod = 'MANUAL' | 'COINS';

export type MarkOwnSharePaidOptions = {
  /**
   * `COINS` only (the AI agent's confirmation card; the HTTP route passes none):
   * pay only this share amount, this many coins, to this payer. Otherwise
   * `409 errors.cost.shareChanged` and no coin moves.
   */
  expect?: { amountMinor: number; coins: number; payerUserId: string };
};

const COIN_SETTLE_ERROR_KEYS: Record<CoinSettleRefusal, string> = {
  COINS_UNAVAILABLE: 'errors.cost.coinsUnavailable',
  ALREADY_SETTLED: 'errors.cost.alreadySettled',
  NO_PAYER: 'errors.cost.noPayer',
  PAYER_CANNOT_PAY_SELF: 'errors.cost.payerCannotPaySelf',
  INSUFFICIENT_COINS: 'errors.cost.insufficientCoins',
};

/**
 * "I paid".
 *
 * `MANUAL` records the claim only — the payer still has to confirm it.
 *
 * `COINS` **claims the share row before a single coin moves**: a conditional
 * `updateMany` that only matches while the share is still unsettled. At READ
 * COMMITTED the loser of a double-tap blocks on that row lock, re-reads the
 * committed row, matches nothing and is refused — so exactly one request per
 * share can ever reach the transfer. If the transfer then fails (insufficient
 * balance, missing user) the claim is handed back untouched, because no money
 * moved. A settled share is therefore paid exactly once, never twice.
 */
export async function markOwnShareAsPaid(
  gameId: string,
  actorId: string,
  method: MarkPaidMethod,
  options: MarkOwnSharePaidOptions = {},
): Promise<GameCostSummaryDto> {
  if (!config.costSplitEnabled) throw new ApiError(404, 'errors.games.notFound');

  const { game, shares, actor, ctx } = await requireLedger(gameId, actorId);
  if (!canMarkOwnCostSharePaid(ctx)) throw new ApiError(403, 'errors.cost.shareNotFound');

  const share = shares.find((row) => row.userId === actorId);
  if (!share) throw new ApiError(404, 'errors.cost.shareNotFound');

  const payerId = effectivePayerId(game);
  if (payerId != null && payerId === actorId) {
    throw new ApiError(400, 'errors.cost.payerCannotPaySelf');
  }

  if (method === 'MANUAL') {
    if (share.markedPaidAt == null) {
      // Conditional so a double-tap writes one timestamp and emits one update.
      const marked = await prisma.gameCostShare.updateMany({
        where: { gameId, userId: actorId, markedPaidAt: null },
        data: { markedPaidAt: new Date(), method: 'MANUAL' },
      });
      if (marked.count > 0) await emitGameCostUpdated(gameId);
    }
    const refreshed = await syncGameCostShares(gameId, { emit: false });
    if (!refreshed) throw new ApiError(404, 'errors.games.notFound');
    return buildSummary(refreshed.game, refreshed.shares, actor, null);
  }

  // COINS
  if (game.priceCurrency == null) throw new ApiError(400, 'errors.cost.notAvailable');

  const rate = await getNumericSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT);
  const plan = planCoinSettlement({
    viewerId: actorId,
    payerId,
    amountMinor: share.amountCents,
    currency: game.priceCurrency,
    coinsPerCurrencyUnit: rate,
    viewerCoinBalance: actor.wallet,
    alreadySettled: share.confirmedAt != null || share.transactionId != null,
  });
  if (!plan.ok) throw new ApiError(400, COIN_SETTLE_ERROR_KEYS[plan.reason]);

  // The agent's card pinned the amount, the coins and the payer it showed.
  // Anything else (a re-split, a new rate, a new payer) is refused, not paid.
  const expect = options.expect;
  if (
    expect &&
    (share.amountCents !== expect.amountMinor ||
      plan.coins !== expect.coins ||
      plan.payerId !== expect.payerUserId)
  ) {
    throw new ApiError(409, 'errors.cost.shareChanged');
  }

  // Claim the share first. The predicate is the guard: only a row that is still
  // unsettled can be stamped, and only one concurrent request can match it.
  // With `expect`, only at the amount the card showed: a re-split between the
  // read above and this claim matches nothing.
  const claimedAt = new Date();
  const claim = await prisma.gameCostShare.updateMany({
    where: {
      gameId,
      userId: actorId,
      confirmedAt: null,
      transactionId: null,
      ...(expect ? { amountCents: expect.amountMinor } : {}),
    },
    data: { markedPaidAt: claimedAt, confirmedAt: claimedAt, method: 'COINS' },
  });
  if (claim.count !== 1) {
    if (expect) {
      const current = await prisma.gameCostShare.findUnique({
        where: { gameId_userId: { gameId, userId: actorId } },
        select: { amountCents: true, confirmedAt: true, transactionId: true },
      });
      if (current && current.confirmedAt == null && current.transactionId == null) {
        throw new ApiError(409, 'errors.cost.shareChanged');
      }
    }
    throw new ApiError(400, COIN_SETTLE_ERROR_KEYS.ALREADY_SETTLED);
  }

  // Our claim, and only while it is still unstamped.
  const ownClaim = { gameId, userId: actorId, confirmedAt: claimedAt, transactionId: null };
  try {
    // `createGuardedTransfer`, not `createTransaction`: the debit must be its
    // own balance check, inside the transfer's transaction.
    //
    // The share is locked and stamped **inside** that transaction. If a roster
    // sync or a game delete removed the claimed row meanwhile, the coins must
    // not move: nothing would be left to refund them from. Locking the share
    // before the wallets keeps the lock order (share → users) the same as the
    // sync and delete paths.
    await createGuardedTransfer({
      fromUserId: actorId,
      toUserId: plan.payerId,
      transactionRows: [
        { name: buildCoinTransferLabel(game.name), price: plan.coins, qty: 1 },
      ],
      guard: {
        beforeMove: async (tx) => {
          const locked = await tx.gameCostShare.updateMany({
            where: ownClaim,
            data: { confirmedAt: claimedAt },
          });
          if (locked.count !== 1) throw new ApiError(404, 'errors.cost.shareNotFound');
        },
        afterMove: async (tx, transactionId) => {
          await tx.gameCostShare.updateMany({ where: ownClaim, data: { transactionId } });
        },
      },
    });
  } catch (error) {
    // No money moved, so hand the claim back exactly as it was found. Scoped to
    // our own claim (`confirmedAt: claimedAt`) so it can never clear somebody
    // else's settlement.
    await prisma.gameCostShare.updateMany({
      where: ownClaim,
      data: { markedPaidAt: share.markedPaidAt, confirmedAt: null, method: share.method },
    });
    throw error;
  }

  await emitGameCostUpdated(gameId);

  const refreshed = await syncGameCostShares(gameId, { emit: false });
  if (!refreshed) throw new ApiError(404, 'errors.games.notFound');
  const updatedActor = await loadActor(actorId);
  return buildSummary(refreshed.game, refreshed.shares, updatedActor, null);
}

/** "Received" — payer, organizers and platform staff only. `paid: false` undoes it. */
export async function setShareConfirmed(
  gameId: string,
  actorId: string,
  targetUserId: string,
  confirmed: boolean,
): Promise<GameCostSummaryDto> {
  if (!config.costSplitEnabled) throw new ApiError(404, 'errors.games.notFound');

  const { shares, actor, ctx } = await requireLedger(gameId, actorId);
  if (!canConfirmCostShare(ctx, targetUserId)) throw new ApiError(403, 'errors.games.accessDenied');

  const share = shares.find((row) => row.userId === targetUserId);
  if (!share) throw new ApiError(404, 'errors.cost.shareNotFound');
  if (share.method === 'COINS' && share.transactionId != null) {
    throw new ApiError(400, 'errors.cost.alreadySettled');
  }

  const now = new Date();
  /*
   * Scoped away from any COINS claim, not just a *settled* one.
   *
   * `settleOwnShareWithCoins` stamps `confirmedAt = claimedAt, method = COINS`
   * and only writes `transactionId` once `createGuardedTransfer` returns. The
   * guard above sees `transactionId == null` for that whole window, so an
   * unconditional write here would clear `confirmedAt` mid-transfer; the
   * claimant's own stamp (`where: { confirmedAt: claimedAt, transactionId: null }`)
   * would then match 0 rows, the share would read unsettled with both fields
   * null, and the next "Pay with coins" would transfer a second time for one
   * share.
   *
   * `method: { not: 'COINS' }` is the guard: a COINS row is owned by the coin
   * path from claim to stamp, and nothing here may touch it. Matching nothing
   * is a refusal, never a silent no-op.
   */
  const written = await prisma.gameCostShare.updateMany({
    where: { gameId, userId: targetUserId, method: { not: 'COINS' } },
    data: confirmed
      ? { confirmedAt: now, markedPaidAt: share.markedPaidAt ?? now }
      : { confirmedAt: null },
  });
  if (written.count !== 1) throw new ApiError(400, 'errors.cost.alreadySettled');
  await emitGameCostUpdated(gameId);

  const refreshed = await syncGameCostShares(gameId, { emit: false });
  if (!refreshed) throw new ApiError(404, 'errors.games.notFound');
  return buildSummary(refreshed.game, refreshed.shares, actor, null);
}

/** Every unsettled share the viewer owes, and every one owed to them as payer. */
export async function getOwedSummary(userId: string): Promise<OwedSummaryDto> {
  if (!config.costSplitEnabled) return { owed: [], owedToMe: [] };

  const actor = await loadActor(userId);
  const visibleGame: Prisma.GameWhereInput = {
    entityType: { not: 'LEAGUE_SEASON' },
    ...(actor.isAdmin ? {} : {
      OR: [
        { participants: { some: {
          userId,
          OR: [{ status: 'PLAYING' }, { role: { in: ['OWNER', 'ADMIN'] } }],
        } } },
        {
          entityType: 'LEAGUE',
          parent: {
            entityType: 'LEAGUE_SEASON',
            participants: { some: { userId, role: { in: ['OWNER', 'ADMIN'] } } },
          },
        },
      ],
    }),
  };

  const [mine, asPayer] = await Promise.all([
    prisma.gameCostShare.findMany({
      where: { userId, confirmedAt: null, game: { ...visibleGame, costPayerId: { not: userId } } },
      select: {
        amountCents: true,
        currency: true,
        markedPaidAt: true,
        confirmedAt: true,
        game: { select: { id: true, name: true, startTime: true, costPayerId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.gameCostShare.findMany({
      where: {
        confirmedAt: null,
        userId: { not: userId },
        game: { ...visibleGame, costPayerId: userId },
      },
      select: {
        userId: true,
        amountCents: true,
        currency: true,
        markedPaidAt: true,
        confirmedAt: true,
        game: { select: { id: true, name: true, startTime: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const counterpartyIds = [
    ...mine.map((row) => row.game.costPayerId ?? ''),
    ...asPayer.map((row) => row.userId),
  ].filter(Boolean);
  const userMap = await loadBasicUsers(counterpartyIds);

  const toRow = (
    row: { amountCents: number; currency: string; markedPaidAt: Date | null; confirmedAt: Date | null },
    game: { id: string; name: string | null; startTime: Date | null },
    counterpartyUserId: string | null,
  ): OwedCostShareDto => ({
    gameId: game.id,
    gameName: game.name,
    startTime: game.startTime ? game.startTime.toISOString() : null,
    amountMinor: row.amountCents,
    currency: row.currency as PriceCurrency,
    state: deriveShareState(row, false),
    counterparty: counterpartyUserId ? userMap.get(counterpartyUserId) ?? null : null,
    counterpartyUserId,
  });

  return {
    owed: mine.map((row) => toRow(row, row.game, row.game.costPayerId)),
    owedToMe: asPayer.map((row) => toRow(row, row.game, row.userId)),
  };
}

export const GameCostService = {
  syncGameCostShares,
  transferCostShareOnSubstitution,
  getGameCostSummary,
  updateGameCostShares,
  markOwnShareAsPaid,
  setShareConfirmed,
  getOwedSummary,
  buildSummary,
  requireLedger,
};
