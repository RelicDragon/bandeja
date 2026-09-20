import type { PriceCurrency, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import notificationService from '../notification.service';
import { NotificationType } from '../../types/notifications.types';
import {
  autoRemindKey,
  claimCostReminder,
  getCostReminderAvailableAt,
  manualRemindKey,
} from './costReminderDedupe';
import { buildCostReminderCopy } from './costReminderCopy';
import {
  COST_REMIND_COOLDOWN_MS,
  effectivePayerId,
  syncGameCostShares,
} from './gameCost.service';
import { canRemindCostShares } from './costSharePermissions';

/**
 * PRD 348 — the settle nudge.
 *
 * Two entry points, one dispatcher:
 * - the hourly {@link CostShareReminderScheduler} fires it once, 24 h after the
 *   game's shares froze;
 * - an organizer may fire it by hand at most once per 24 h per game.
 *
 * Both take a claim from `costReminderDedupe`, which lives outside the process,
 * so a restart can never resend (CONTRACT §5.4).
 */

/** The automatic nudge goes out on the first hourly tick at or after this delay. */
export const AUTO_REMIND_DELAY_MS = 24 * 60 * 60 * 1000;

/** Games frozen longer ago than this are never auto-reminded (a cold start must not spam). */
export const AUTO_REMIND_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const AUTO_REMIND_BATCH_SIZE = 50;

/**
 * How many pages of the due window one sweep may walk before giving up.
 * Already-claimed games keep matching the `where` for the rest of their 7-day
 * window, so the sweep has to page past them or everything after the first page
 * starves. `50 × 10` is a full hourly tick's worth of work and still bounded.
 */
export const AUTO_REMIND_MAX_PAGES = 10;

type ReminderRecipient = {
  userId: string;
  amountMinor: number;
  currency: PriceCurrency;
  language: string | null;
};

async function dispatchReminders(
  game: { id: string; name: string | null },
  payerName: string,
  recipients: readonly ReminderRecipient[],
): Promise<number> {
  let sent = 0;
  for (const recipient of recipients) {
    const copy = buildCostReminderCopy({
      language: recipient.language,
      amountMinor: recipient.amountMinor,
      currency: recipient.currency,
      payerName,
      gameName: game.name ?? '',
    });
    try {
      await notificationService.sendNotification({
        userId: recipient.userId,
        type: NotificationType.GAME_COST_REMINDER,
        payload: {
          type: NotificationType.GAME_COST_REMINDER,
          title: copy.title,
          body: copy.body,
          data: { gameId: game.id, entityType: 'GAME' },
        },
      });
      sent += 1;
    } catch (error) {
      console.error('[CostShareReminder] dispatch failed', recipient.userId, error);
    }
  }
  return sent;
}

type UnpaidLedger = {
  game: { id: string; name: string | null; priceCurrency: PriceCurrency | null };
  payerName: string;
  recipients: ReminderRecipient[];
};

async function loadUnpaidLedger(gameId: string): Promise<UnpaidLedger | null> {
  const synced = await syncGameCostShares(gameId, { emit: false });
  if (!synced) return null;

  const { game, shares } = synced;
  if (game.priceCurrency == null || shares.length === 0) return null;

  const payerId = effectivePayerId(game);
  const unpaid = shares.filter(
    (share) => share.confirmedAt == null && share.userId !== payerId,
  );
  if (unpaid.length === 0) return null;

  const users = await prisma.user.findMany({
    where: { id: { in: [...unpaid.map((s) => s.userId), payerId ?? ''].filter(Boolean) } },
    select: { id: true, firstName: true, lastName: true, language: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  const payer = payerId ? byId.get(payerId) : null;
  const payerName = payer
    ? `${payer.firstName ?? ''} ${payer.lastName ?? ''}`.trim() || (payer.firstName ?? '')
    : '';

  return {
    game: { id: game.id, name: game.name, priceCurrency: game.priceCurrency },
    payerName,
    recipients: unpaid.map((share) => ({
      userId: share.userId,
      amountMinor: share.amountCents,
      currency: share.currency as PriceCurrency,
      language: byId.get(share.userId)?.language ?? null,
    })),
  };
}

/** Organizer-triggered "Remind unpaid". Rate limited to one nudge per game per day. */
export async function remindUnpaidShares(
  gameId: string,
  actorId: string,
): Promise<{ sent: number; availableAt: string | null }> {
  if (!config.costSplitEnabled) throw new ApiError(404, 'errors.games.notFound');

  const synced = await syncGameCostShares(gameId, { emit: false });
  if (!synced) throw new ApiError(404, 'errors.games.notFound');

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, isAdmin: true },
  });
  if (!actor) throw new ApiError(404, 'errors.users.notFound');

  const allowed = canRemindCostShares({
    userId: actor.id,
    isPlatformAdmin: actor.isAdmin,
    gameOwnerUserId:
      synced.game.participants.find((p) => p.role === 'OWNER')?.userId ?? null,
    gameAdminUserIds: synced.game.participants
      .filter((p) => p.role === 'ADMIN')
      .map((p) => p.userId),
    payerUserId: effectivePayerId(synced.game),
    rosterUserIds: synced.game.participants.map((p) => p.userId),
    shareUserIds: synced.shares.map((s) => s.userId),
  });
  if (!allowed) throw new ApiError(403, 'errors.games.accessDenied');

  const ledger = await loadUnpaidLedger(gameId);
  if (!ledger) return { sent: 0, availableAt: null };

  const claimed = await claimCostReminder(manualRemindKey(gameId), COST_REMIND_COOLDOWN_MS);
  if (!claimed) {
    const availableAt = await getCostReminderAvailableAt(
      manualRemindKey(gameId),
      COST_REMIND_COOLDOWN_MS,
    );
    throw new ApiError(429, 'errors.cost.remindCooldown', true, {
      availableAt: availableAt ? availableAt.toISOString() : null,
    });
  }

  const sent = await dispatchReminders(ledger.game, ledger.payerName, ledger.recipients);
  const availableAt = await getCostReminderAvailableAt(
    manualRemindKey(gameId),
    COST_REMIND_COOLDOWN_MS,
  );
  return { sent, availableAt: availableAt ? availableAt.toISOString() : null };
}

/** When the organizer may nudge again, for the cooldown caption. */
export async function getRemindAvailableAt(gameId: string): Promise<Date | null> {
  if (!config.costSplitEnabled) return null;
  return getCostReminderAvailableAt(manualRemindKey(gameId), COST_REMIND_COOLDOWN_MS);
}

/**
 * One automatic sweep.
 *
 * Step 1 is a **backstop**: `onGameFinalizedForCost` freezes the ledger at the
 * FINAL transition itself, so `Game.costFrozenAt` is the FINAL timestamp and
 * the 24 h delay is measured from the right clock. This pass only catches games
 * that went FINAL through a path that never reached that hook.
 * Step 2 nudges every game that froze between 24 h and 7 days ago and still has
 * an unpaid share. The claim makes step 2 a no-op on every later pass.
 */
export async function runCostShareReminderSweep(now: Date = new Date()): Promise<{
  frozen: number;
  remindedGames: number;
  notifications: number;
}> {
  if (!config.costSplitEnabled) return { frozen: 0, remindedGames: 0, notifications: 0 };

  const freezeCutoff = new Date(now.getTime() - AUTO_REMIND_MAX_AGE_MS);
  const toFreeze = await prisma.game.findMany({
    where: {
      resultsStatus: 'FINAL',
      costFrozenAt: null,
      priceType: { in: ['TOTAL', 'PER_PERSON'] },
      priceCurrency: { not: null },
      updatedAt: { gte: freezeCutoff },
    },
    select: { id: true },
    take: AUTO_REMIND_BATCH_SIZE,
  });

  let frozen = 0;
  for (const game of toFreeze) {
    try {
      await syncGameCostShares(game.id);
      frozen += 1;
    } catch (error) {
      console.error('[CostShareReminder] freeze failed', game.id, error);
    }
  }

  const dueBefore = new Date(now.getTime() - AUTO_REMIND_DELAY_MS);
  const dueAfter = new Date(now.getTime() - AUTO_REMIND_MAX_AGE_MS);

  // A game stays inside the 24 h–7 d window for six days, and a game that has
  // already been reminded still matches this `where`. An unordered single page
  // therefore hands back the same already-claimed rows on every tick and every
  // game past the first page never gets its nudge. Page through the window with
  // a stable keyset instead, and count *reminders* rather than rows scanned.
  let remindedGames = 0;
  let notifications = 0;
  let cursorId: string | null = null;

  for (let page = 0; page < AUTO_REMIND_MAX_PAGES; page += 1) {
    if (remindedGames >= AUTO_REMIND_BATCH_SIZE) break;

    // The cursor is applied through an explicitly-typed args object: spreading a
    // conditional `cursor`/`skip` straight into the call makes TypeScript resolve
    // the overload circularly through `due`.
    const dueArgs: Prisma.GameFindManyArgs = {
      where: {
        costFrozenAt: { lte: dueBefore, gte: dueAfter },
        costShares: { some: { confirmedAt: null } },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: AUTO_REMIND_BATCH_SIZE,
    };
    if (cursorId) {
      dueArgs.cursor = { id: cursorId };
      dueArgs.skip = 1;
    }

    const due = (await prisma.game.findMany(dueArgs)) as { id: string }[];
    if (due.length === 0) break;
    cursorId = due[due.length - 1].id;

    for (const game of due) {
      if (remindedGames >= AUTO_REMIND_BATCH_SIZE) break;
      try {
        const claimed = await claimCostReminder(autoRemindKey(game.id), AUTO_REMIND_MAX_AGE_MS);
        if (!claimed) continue;
        const ledger = await loadUnpaidLedger(game.id);
        if (!ledger) continue;
        notifications += await dispatchReminders(ledger.game, ledger.payerName, ledger.recipients);
        remindedGames += 1;
      } catch (error) {
        console.error('[CostShareReminder] auto reminder failed', game.id, error);
      }
    }

    if (due.length < AUTO_REMIND_BATCH_SIZE) break;
  }

  return { frozen, remindedGames, notifications };
}
