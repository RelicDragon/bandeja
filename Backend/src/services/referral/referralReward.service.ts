import { EntityType, Prisma, TransactionType } from '@prisma/client';
import prisma from '../../config/database';
import { TransactionService } from '../transaction.service';
import {
  checkReferralEligibility,
  getReferralRewardAmounts,
} from './referral.service';
import { referralT } from './referralCopy';
import { REFERRAL_TRANSACTION_REASON } from './referralCode';

/**
 * PRD 351 — the payout.
 *
 * **This is the only code path in PRDs 345–357 that mints currency, so read the
 * idempotency contract before touching it.**
 *
 * `ReferralReward.referredUserId` is `@unique`. The row is inserted *before*
 * any coin moves and acts as the claim: a second caller — a retry, a concurrent
 * finalization of two games, an admin re-running `recalculateGameOutcomes` —
 * loses the insert with P2002 and returns immediately. Nothing downstream of
 * that insert can run twice. If *both* grants then fail, the claim row is
 * deleted so a later finalization can try again; a partial success keeps the
 * row (and records whichever transaction landed), because retrying would
 * double-pay the side that already got its coins.
 *
 * Everything here runs **post-commit** from `recalculateGameOutcomes`. It must
 * never be called inside the outcomes transaction: a wallet write inside that
 * transaction would widen its lock footprint to the `User` rows of people who
 * are not even in the game, and a referral failure would roll back a finalized
 * result.
 */

/** Only real competitive play counts. Training, bar nights and events do not. */
export const REFERRAL_QUALIFYING_ENTITY_TYPES: EntityType[] = [
  EntityType.GAME,
  EntityType.TOURNAMENT,
  EntityType.LEAGUE,
];

export interface ReferralRewardOutcome {
  referredUserId: string;
  referrerUserId: string;
  granted: boolean;
  /** Why nothing was paid. `null` when `granted` is true. */
  skipped:
    | 'ALREADY_REWARDED'
    | 'NO_REFERRER'
    | 'NOT_ELIGIBLE'
    | 'GRANT_FAILED'
    | null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

async function grantCoins(userId: string, amount: number): Promise<string | null> {
  if (amount <= 0) return null;
  const transaction = await TransactionService.createTransaction({
    type: TransactionType.NEW_COIN,
    toUserId: userId,
    transactionRows: [{ name: REFERRAL_TRANSACTION_REASON, price: amount, qty: 1 }],
  });
  return transaction?.id ?? null;
}

/**
 * Pays one referral, exactly once.
 *
 * Returns `granted: false` for every non-payout path — an already-rewarded
 * user, an unreferred user, a pair that trips an abuse rule, or a referrer at
 * the cap. None of those is an error the caller should surface.
 */
export async function grantReferralReward(
  referredUserId: string,
): Promise<ReferralRewardOutcome> {
  const referred = await prisma.user.findUnique({
    where: { id: referredUserId },
    select: { id: true, referredByUserId: true, firstName: true, language: true },
  });
  if (!referred?.referredByUserId) {
    return {
      referredUserId,
      referrerUserId: '',
      granted: false,
      skipped: 'NO_REFERRER',
    };
  }
  const referrerUserId = referred.referredByUserId;

  const already = await prisma.referralReward.findUnique({
    where: { referredUserId },
    select: { id: true },
  });
  if (already) {
    return { referredUserId, referrerUserId, granted: false, skipped: 'ALREADY_REWARDED' };
  }

  // Re-checked at payout, not only at conversion: the second account can pick
  // up a shared phone, push token or device between signing up and playing,
  // and the referrer can hit the cap in the meantime.
  const abuse = await checkReferralEligibility(referrerUserId, referredUserId);
  if (abuse) {
    return { referredUserId, referrerUserId, granted: false, skipped: 'NOT_ELIGIBLE' };
  }

  let claimId: string;
  try {
    const claim = await prisma.referralReward.create({
      data: { referredUserId, referrerUserId },
      select: { id: true },
    });
    claimId = claim.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { referredUserId, referrerUserId, granted: false, skipped: 'ALREADY_REWARDED' };
    }
    throw error;
  }

  const amounts = await getReferralRewardAmounts();
  let referrerTxId: string | null = null;
  let referredTxId: string | null = null;
  try {
    referrerTxId = await grantCoins(referrerUserId, amounts.referrer);
  } catch (error) {
    console.error(`[Referral] referrer grant failed for ${referrerUserId}:`, error);
  }
  try {
    referredTxId = await grantCoins(referredUserId, amounts.referred);
  } catch (error) {
    console.error(`[Referral] referred grant failed for ${referredUserId}:`, error);
  }

  if (!referrerTxId && !referredTxId) {
    // Nothing moved, so releasing the claim cannot double-pay anyone.
    await prisma.referralReward.deleteMany({ where: { id: claimId } });
    return { referredUserId, referrerUserId, granted: false, skipped: 'GRANT_FAILED' };
  }

  await prisma.referralReward.update({
    where: { id: claimId },
    data: { referrerTxId, referredTxId },
  });

  await sendRewardNotifications({
    referrerUserId,
    referredUserId,
    referredFirstName: referred.firstName,
    referrerTxId,
    referredTxId,
    amounts,
  }).catch((error: unknown) => {
    console.error('[Referral] reward notification failed:', error);
  });

  return { referredUserId, referrerUserId, granted: true, skipped: null };
}

/**
 * Post-commit hook from `recalculateGameOutcomes`.
 *
 * Fans out over the game's outcomes and attempts one payout per referred
 * player. Never throws: a referral failure must not be able to disturb a
 * finalized result.
 */
export async function onGameFinalizedForReferral(gameId: string): Promise<void> {
  try {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true, entityType: true, resultsStatus: true },
    });
    if (!game || game.resultsStatus !== 'FINAL') return;
    if (!REFERRAL_QUALIFYING_ENTITY_TYPES.includes(game.entityType)) return;

    const outcomes = await prisma.gameOutcome.findMany({
      where: { gameId },
      select: { userId: true },
    });
    if (outcomes.length === 0) return;

    const referredPlayers = await prisma.user.findMany({
      where: {
        id: { in: outcomes.map((row) => row.userId) },
        referredByUserId: { not: null },
        referralRewardReceived: { is: null },
      },
      select: { id: true },
    });

    for (const player of referredPlayers) {
      try {
        await grantReferralReward(player.id);
      } catch (error) {
        console.error(`[Referral] reward failed for user ${player.id}:`, error);
      }
    }
  } catch (error) {
    console.error(`[Referral] finalization hook failed for game ${gameId}:`, error);
  }
}

/**
 * Admin revoke. Clears the payout record so the cap slot is freed; it does
 * **not** claw back coins — reversing a spent balance is a separate decision
 * and the PRD scopes revoke to the referral record only.
 */
export async function revokeReferralReward(rewardId: string): Promise<boolean> {
  const updated = await prisma.referralReward.updateMany({
    where: { id: rewardId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return updated.count > 0;
}

async function sendRewardNotifications(input: {
  referrerUserId: string;
  referredUserId: string;
  referredFirstName: string | null;
  referrerTxId: string | null;
  referredTxId: string | null;
  amounts: { referrer: number; referred: number };
}): Promise<void> {
  const [{ default: notificationService }, { NotificationType }] = await Promise.all([
    import('../notification.service'),
    import('../../types/notifications.types'),
  ]);
  const [referrer, referred] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.referrerUserId },
      select: { language: true },
    }),
    prisma.user.findUnique({
      where: { id: input.referredUserId },
      select: { language: true },
    }),
  ]);

  const referrerLang = referrer?.language || 'en';
  const referredLang = referred?.language || 'en';
  const name = input.referredFirstName?.trim() || referralT('referral.someone', referrerLang);

  // Both sides reuse `TRANSACTION` with a referral message variant (PRD 351),
  // so they inherit the existing wallet preference and push plumbing.
  if (input.referrerTxId) {
    await notificationService.sendNotification({
      userId: input.referrerUserId,
      type: NotificationType.TRANSACTION,
      payload: {
        type: NotificationType.TRANSACTION,
        title: referralT('referral.rewardReferrerTitle', referrerLang),
        body: referralT('referral.rewardReferrerBody', referrerLang, {
          name,
          coins: input.amounts.referrer,
        }),
        data: { transactionId: input.referrerTxId, referralReward: '1' },
        sound: 'default',
      },
    });
  }

  if (input.referredTxId) {
    await notificationService.sendNotification({
      userId: input.referredUserId,
      type: NotificationType.TRANSACTION,
      payload: {
        type: NotificationType.TRANSACTION,
        title: referralT('referral.rewardReferredTitle', referredLang),
        body: referralT('referral.rewardReferredBody', referredLang, {
          coins: input.amounts.referred,
        }),
        data: { transactionId: input.referredTxId, referralReward: '1' },
        sound: 'default',
      },
    });
  }
}
