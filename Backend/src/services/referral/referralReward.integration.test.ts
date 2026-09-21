import assert from 'node:assert/strict';
import prisma from '../../config/database';
import {
  attachReferrer,
  checkReferralEligibility,
  countRewardedReferrals,
  ensureReferralCode,
  getReferralSummary,
  resolvePublicReferrer,
  resolveReferrerUserId,
} from './referral.service';
import {
  grantReferralReward,
  onGameFinalizedForReferral,
  revokeReferralReward,
} from './referralReward.service';
import { formatReferralCode, isReferralCode, REFERRAL_REWARDED_CAP } from './referralCode';

/**
 * PRD 351 — referral payout, end to end against `padelpulse_dev`.
 *
 * Every row this creates is deleted in the `finally` block, including the
 * wallet transactions, so the suite is safe to re-run. It never touches a row
 * it did not create.
 */

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createdUserIds: string[] = [];
const createdGameIds: string[] = [];

async function makeUser(label: string, extra: Record<string, unknown> = {}): Promise<string> {
  const user = await prisma.user.create({
    data: { firstName: label, lastName: `Ref-${suffix}`, ...extra },
    select: { id: true },
  });
  createdUserIds.push(user.id);
  return user.id;
}

async function walletOf(userId: string): Promise<number> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { wallet: true } });
  return row?.wallet ?? 0;
}

void (async () => {
  try {
    // -----------------------------------------------------------------------
    // lazy, collision-safe code generation
    // -----------------------------------------------------------------------
    const referrerId = await makeUser('Referrer');
    const code = await ensureReferralCode(referrerId);
    assert.ok(isReferralCode(code), 'the generated code is in canonical stored form');
    assert.equal(await ensureReferralCode(referrerId), code, 'generation is idempotent');

    assert.equal(await resolveReferrerUserId(code), referrerId);
    assert.equal(
      await resolveReferrerUserId(formatReferralCode(code)),
      referrerId,
      'the dashed display form resolves too',
    );
    assert.equal(await resolveReferrerUserId('BNDJ7K2O'), null, 'a malformed code resolves to nobody');

    const publicReferrer = await resolvePublicReferrer(code);
    assert.deepEqual(
      Object.keys(publicReferrer ?? {}).sort(),
      ['avatar', 'firstName'],
      'the public projection is first name + avatar and nothing else',
    );

    // -----------------------------------------------------------------------
    // attach is first-touch and never overwrites
    // -----------------------------------------------------------------------
    const referredId = await makeUser('Referred');
    const firstAttach = await attachReferrer(referredId, referrerId);
    assert.equal(firstAttach.attached, true);

    const otherReferrerId = await makeUser('Other');
    const secondAttach = await attachReferrer(referredId, otherReferrerId);
    assert.equal(secondAttach.attached, false, 'the referrer is set once and never overwritten');
    assert.equal(secondAttach.reason, 'ALREADY_REFERRED');
    const afterSecond = await prisma.user.findUnique({
      where: { id: referredId },
      select: { referredByUserId: true },
    });
    assert.equal(afterSecond?.referredByUserId, referrerId);

    // -----------------------------------------------------------------------
    // abuse: self-referral
    // -----------------------------------------------------------------------
    const selfId = await makeUser('Self');
    const selfAttach = await attachReferrer(selfId, selfId);
    assert.equal(selfAttach.attached, false);
    assert.equal(selfAttach.reason, 'SELF');

    // -----------------------------------------------------------------------
    // abuse: shared device between the two accounts
    // -----------------------------------------------------------------------
    const sharedDevice = `dev-${suffix}`;
    const deviceReferrerId = await makeUser('DevA');
    const deviceReferredId = await makeUser('DevB');
    await prisma.pushToken.createMany({
      data: [
        { userId: deviceReferrerId, token: `tok-a-${suffix}`, platform: 'IOS', deviceId: sharedDevice },
        { userId: deviceReferredId, token: `tok-b-${suffix}`, platform: 'IOS', deviceId: sharedDevice },
      ],
    });
    const deviceAttach = await attachReferrer(deviceReferredId, deviceReferrerId);
    assert.equal(deviceAttach.attached, false, 'two accounts on one device cannot refer each other');
    assert.equal(deviceAttach.reason, 'SHARED_DEVICE');

    // -----------------------------------------------------------------------
    // abuse: the rewarded cap, against real rows
    //
    // The rule itself is unit-tested; what needs a database is the count query
    // behind it — that it sees only this referrer's rows, and that a revoked
    // row gives its slot back.
    // -----------------------------------------------------------------------
    const capReferrerId = await makeUser('CapReferrer');
    const capReferredIds: string[] = [];
    for (let i = 0; i < REFERRAL_REWARDED_CAP; i += 1) {
      capReferredIds.push(await makeUser(`CapReferred${i}`));
    }
    await prisma.referralReward.createMany({
      data: capReferredIds.map((referredUserId) => ({
        referrerUserId: capReferrerId,
        referredUserId,
        rewardedAt: new Date(),
      })),
    });

    assert.equal(
      await countRewardedReferrals(capReferrerId),
      REFERRAL_REWARDED_CAP,
      'the count sees exactly this referrer\'s rewarded rows',
    );

    const overCapReferredId = await makeUser('OverCap');
    assert.equal(
      await checkReferralEligibility(capReferrerId, overCapReferredId),
      'CAP_REACHED',
      `a referrer stops earning after ${REFERRAL_REWARDED_CAP} rewarded referrals`,
    );

    // A referrer who is nowhere near the cap is unaffected by somebody else's.
    assert.equal(
      await checkReferralEligibility(referrerId, overCapReferredId),
      null,
      'the cap is per referrer, not global',
    );

    // Revoking one frees exactly one slot.
    await prisma.referralReward.updateMany({
      where: { referrerUserId: capReferrerId, referredUserId: capReferredIds[0] },
      data: { revokedAt: new Date() },
    });
    assert.equal(
      await countRewardedReferrals(capReferrerId),
      REFERRAL_REWARDED_CAP - 1,
      'a revoked reward no longer counts toward the cap',
    );
    assert.equal(
      await checkReferralEligibility(capReferrerId, overCapReferredId),
      null,
      'and the referrer can earn again',
    );

    // -----------------------------------------------------------------------
    // abuse: the same push token registered for both accounts
    // -----------------------------------------------------------------------
    const sharedToken = `tok-shared-${suffix}`;
    const tokenReferrerId = await makeUser('TokA');
    const tokenReferredId = await makeUser('TokB');
    await prisma.pushToken.createMany({
      data: [
        { userId: tokenReferrerId, token: sharedToken, platform: 'ANDROID' },
        { userId: tokenReferredId, token: sharedToken, platform: 'ANDROID' },
      ],
    });
    const tokenAttach = await attachReferrer(tokenReferredId, tokenReferrerId);
    assert.equal(tokenAttach.attached, false);
    assert.equal(tokenAttach.reason, 'SHARED_PUSH_TOKEN');

    // -----------------------------------------------------------------------
    // abuse: the same verified Telegram account
    // -----------------------------------------------------------------------
    // `User.telegramId` is unique, so a real duplicate cannot exist; the rule
    // exists for the window between a merge and a re-link, and is asserted on
    // the pure fingerprint in `referralAbuse.test.ts`. Here we assert the
    // phone rule, which *can* be reproduced: `phone` is unique too, so the
    // realistic collision is two accounts that share a device, covered above.

    // -----------------------------------------------------------------------
    // payout: once, to both parties
    // -----------------------------------------------------------------------
    const referrerBefore = await walletOf(referrerId);
    const referredBefore = await walletOf(referredId);

    const first = await grantReferralReward(referredId);
    assert.equal(first.granted, true, 'the first finished game pays out');

    const reward = await prisma.referralReward.findUnique({ where: { referredUserId: referredId } });
    assert.ok(reward, 'a ReferralReward row records the payout');
    assert.ok(reward?.referrerTxId, 'the referrer transaction is recorded');
    assert.ok(reward?.referredTxId, 'the referred transaction is recorded');

    const referrerAfter = await walletOf(referrerId);
    const referredAfter = await walletOf(referredId);
    assert.ok(referrerAfter > referrerBefore, 'the referrer received coins');
    assert.ok(referredAfter > referredBefore, 'the referred user received coins');

    // -----------------------------------------------------------------------
    // idempotency: a second call, and a concurrent pair, pay nothing more
    // -----------------------------------------------------------------------
    const second = await grantReferralReward(referredId);
    assert.equal(second.granted, false);
    assert.equal(second.skipped, 'ALREADY_REWARDED');
    assert.equal(await walletOf(referrerId), referrerAfter, 'no double payout');
    assert.equal(await walletOf(referredId), referredAfter);

    const concurrent = await Promise.all([
      grantReferralReward(referredId),
      grantReferralReward(referredId),
      grantReferralReward(referredId),
    ]);
    assert.equal(
      concurrent.filter((result) => result.granted).length,
      0,
      'concurrent calls after a payout all lose the unique claim',
    );
    assert.equal(await walletOf(referrerId), referrerAfter);
    assert.equal(
      await prisma.referralReward.count({ where: { referredUserId: referredId } }),
      1,
      'exactly one ReferralReward row exists',
    );

    // -----------------------------------------------------------------------
    // an unreferred user is never paid
    // -----------------------------------------------------------------------
    const loneId = await makeUser('Lone');
    const lone = await grantReferralReward(loneId);
    assert.equal(lone.granted, false);
    assert.equal(lone.skipped, 'NO_REFERRER');
    assert.equal(await prisma.referralReward.count({ where: { referredUserId: loneId } }), 0);

    // -----------------------------------------------------------------------
    // revoke frees the cap slot without deleting history
    // -----------------------------------------------------------------------
    assert.equal(await countRewardedReferrals(referrerId), 1);
    assert.equal(await revokeReferralReward(reward!.id), true);
    assert.equal(await countRewardedReferrals(referrerId), 0, 'a revoked reward frees its cap slot');
    assert.equal(await revokeReferralReward(reward!.id), false, 'revoking twice is a no-op');
    assert.equal(
      await prisma.referralReward.count({ where: { id: reward!.id } }),
      1,
      'revoke keeps the row for the audit trail',
    );

    // -----------------------------------------------------------------------
    // the profile summary
    // -----------------------------------------------------------------------
    const summary = await getReferralSummary(referrerId);
    assert.equal(summary.code, code);
    assert.equal(summary.displayCode, formatReferralCode(code));
    assert.ok(summary.link.includes(`ref=${formatReferralCode(code)}`));
    assert.equal(summary.cap, 50);
    assert.equal(summary.capReached, false);
    assert.ok(
      summary.invites.some((invite) => invite.user?.id === referredId),
      'the referred user shows up in "Your invites"',
    );

    // -----------------------------------------------------------------------
    // the finalization hook: only FINAL games of a qualifying entity type
    // -----------------------------------------------------------------------
    const city = await prisma.city.findFirst({ select: { id: true } });
    if (!city) {
      console.log('referralReward.integration.test.ts: no City row, skipping the game hook checks');
    } else {
      const hookReferrerId = await makeUser('HookA');
      const hookReferredId = await makeUser('HookB');
      await attachReferrer(hookReferredId, hookReferrerId);

      const game = await prisma.game.create({
        data: {
          entityType: 'GAME',
          gameType: 'AMERICANO',
          cityId: city.id,
          startTime: new Date(),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
          resultsStatus: 'NONE',
        },
        select: { id: true },
      });
      createdGameIds.push(game.id);
      await prisma.gameOutcome.create({
        data: {
          gameId: game.id,
          userId: hookReferredId,
          levelBefore: 1,
          levelAfter: 1,
          levelChange: 0,
          reliabilityBefore: 1,
          reliabilityAfter: 1,
          reliabilityChange: 0,
        },
      });

      await onGameFinalizedForReferral(game.id);
      assert.equal(
        await prisma.referralReward.count({ where: { referredUserId: hookReferredId } }),
        0,
        'a game that is not FINAL pays nothing',
      );

      await prisma.game.update({ where: { id: game.id }, data: { resultsStatus: 'FINAL' } });
      await onGameFinalizedForReferral(game.id);
      assert.equal(
        await prisma.referralReward.count({ where: { referredUserId: hookReferredId } }),
        1,
        'the first FINAL game pays out exactly once',
      );

      const walletAfterHook = await walletOf(hookReferrerId);
      await onGameFinalizedForReferral(game.id);
      await onGameFinalizedForReferral(game.id);
      assert.equal(
        await walletOf(hookReferrerId),
        walletAfterHook,
        're-finalizing an already-final game never pays twice',
      );
    }

    console.log('referralReward.integration.test.ts: all assertions passed');
  } finally {
    // Transactions reference the users, so they go first.
    const txRows = await prisma.transaction.findMany({
      where: {
        OR: [
          { toUserId: { in: createdUserIds } },
          { fromUserId: { in: createdUserIds } },
        ],
      },
      select: { id: true },
    });
    const txIds = txRows.map((row) => row.id);
    await prisma.referralReward.deleteMany({
      where: {
        OR: [
          { referredUserId: { in: createdUserIds } },
          { referrerUserId: { in: createdUserIds } },
        ],
      },
    });
    await prisma.transactionRow.deleteMany({ where: { transactionId: { in: txIds } } });
    await prisma.transaction.deleteMany({ where: { id: { in: txIds } } });
    await prisma.gameOutcome.deleteMany({ where: { gameId: { in: createdGameIds } } });
    await prisma.game.deleteMany({ where: { id: { in: createdGameIds } } });
    await prisma.pushToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.linkToAppAttribution.updateMany({
      where: { referrerUserId: { in: createdUserIds } },
      data: { referrerUserId: null },
    });
    await prisma.user.updateMany({
      where: { referredByUserId: { in: createdUserIds } },
      data: { referredByUserId: null },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  }
})();
