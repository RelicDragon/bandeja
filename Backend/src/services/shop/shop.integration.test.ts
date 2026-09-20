/**
 * PRD 355 — the shop, proven against a real database.
 *
 * Covers the Testing Decisions that only a database can answer:
 *   · a purchase debits the wallet, writes the PURCHASE transaction row and
 *     grants ownership **atomically**;
 *   · a second purchase of the same item is rejected and spends nothing;
 *   · the premium-only gate is enforced server-side, for buyer and recipient;
 *   · a gift gives the row to the recipient and bills the buyer;
 *   · withdrawing refunds every owner exactly once, even when re-run, and a
 *     withdraw → re-activate → re-buy → withdraw cycle refunds **both**
 *     ownership instances (the refund is per ownership, not per lifetime);
 *   · two simultaneous purchases of different items cannot overdraw the wallet;
 *   · a gift may not cross a block;
 *   · equip keeps at most one item per kind.
 *
 * Safe to run against `padelpulse_dev`: every row is namespaced with a run
 * suffix and removed in `finally`. Outbound notifications are suppressed.
 */
import assert from 'node:assert/strict';
import { GoodsKind, Sport, TransactionType } from '@prisma/client';
import prisma from '../../config/database';
import { ShopService } from './shop.service';
import { purchaseGoods } from './shopPurchase.service';
import { ShopAdminService } from './shopAdmin.service';
import { ApiError } from '../../utils/ApiError';

process.env.E2E_TEST = '1';

void (async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const userIds: string[] = [];
  const goodsIds: string[] = [];

  const makeUser = async (name: string, wallet: number, isPremium = false) => {
    const user = await prisma.user.create({
      data: {
        phone: `qa-shop-${name}-${suffix}`,
        firstName: name,
        wallet,
        isPremium,
        primarySport: Sport.PADEL,
      },
    });
    userIds.push(user.id);
    return user;
  };

  const makeGoods = async (
    name: string,
    kind: GoodsKind,
    price: number,
    extra: { premiumOnly?: boolean; isFeatured?: boolean } = {},
  ) => {
    const goods = await prisma.goods.create({
      data: {
        name: `${name} ${suffix}`,
        kind,
        assetKey: `qa-${name}-${suffix}`,
        price,
        isActive: true,
        premiumOnly: extra.premiumOnly ?? false,
        isFeatured: extra.isFeatured ?? false,
      },
    });
    goodsIds.push(goods.id);
    return goods;
  };

  const walletOf = async (userId: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { wallet: true } })).wallet;

  try {
    // 800 covers everything `buyer` spends below — 120 + 200 + 80 + 60 up front,
    // then two 80-coin re-buys in the withdraw cycle. At 500 the re-buy at step 9
    // was refused for funds, which is a fixture bug and not a shop bug: the
    // wallet gate is authoritative and must never be softened to fit a test.
    const buyer = await makeUser('buyer', 800);
    const friend = await makeUser('friend', 10);
    const premiumFriend = await makeUser('premium', 0, true);
    const poor = await makeUser('poor', 30);

    const frame = await makeGoods('frame', GoodsKind.PROFILE_FRAME, 120, { isFeatured: true });
    const otherFrame = await makeGoods('frame2', GoodsKind.PROFILE_FRAME, 60);
    const nameColor = await makeGoods('color', GoodsKind.NAME_COLOR, 80);
    const goldOnly = await makeGoods('gold', GoodsKind.CHAT_ACCENT, 200, { premiumOnly: true });

    // --- 1. purchase is atomic -------------------------------------------
    const bought = await purchaseGoods({ goodsId: frame.id, buyerUserId: buyer.id });
    assert.equal(bought.buyerBalance, 680, 'wallet debited by the price');
    assert.equal(await walletOf(buyer.id), 680);
    const owned = await prisma.userGoods.findUnique({
      where: { userId_goodsId: { userId: buyer.id, goodsId: frame.id } },
    });
    assert.ok(owned, 'ownership row written in the same transaction');
    assert.equal(owned.giftedByUserId, null);
    const txRow = await prisma.transactionRow.findFirst({
      where: { goodsId: frame.id, transaction: { fromUserId: buyer.id } },
      include: { transaction: true },
    });
    assert.ok(txRow, 'history carries the item');
    assert.equal(txRow.transaction.type, TransactionType.PURCHASE);
    assert.equal(txRow.transaction.total, -120, 'PURCHASE totals are negated');
    assert.equal(txRow.name, frame.name, 'history shows the item name');

    // --- 2. double purchase rejected, nothing spent -----------------------
    await assert.rejects(
      () => purchaseGoods({ goodsId: frame.id, buyerUserId: buyer.id }),
      (error: unknown) => error instanceof ApiError && error.statusCode === 409,
    );
    assert.equal(await walletOf(buyer.id), 680, 'a rejected purchase spends nothing');
    assert.equal(
      await prisma.userGoods.count({ where: { userId: buyer.id, goodsId: frame.id } }),
      1,
      'ownership stays single',
    );

    // --- 3. premium-only gate, server-side ---------------------------------
    await assert.rejects(
      () => purchaseGoods({ goodsId: goldOnly.id, buyerUserId: buyer.id }),
      (error: unknown) => error instanceof ApiError && error.statusCode === 403,
    );
    assert.equal(await walletOf(buyer.id), 680, 'the gate refunds nothing because it spends nothing');
    // Gifting a premium item to a premium member is allowed and bills the buyer.
    const giftedGold = await purchaseGoods({
      goodsId: goldOnly.id,
      buyerUserId: buyer.id,
      recipientUserId: premiumFriend.id,
    });
    assert.equal(giftedGold.buyerBalance, 480);
    assert.equal(await walletOf(premiumFriend.id), 0, 'the recipient is not charged');

    // --- 4. gift ownership --------------------------------------------------
    const gift = await purchaseGoods({
      goodsId: nameColor.id,
      buyerUserId: buyer.id,
      recipientUserId: friend.id,
    });
    assert.equal(gift.isGift, true);
    assert.equal(gift.ownerUserId, friend.id);
    assert.equal(await walletOf(buyer.id), 400, 'the payer is the buyer');
    assert.equal(await walletOf(friend.id), 10, 'the recipient pays nothing');
    const giftRow = await prisma.userGoods.findUniqueOrThrow({
      where: { userId_goodsId: { userId: friend.id, goodsId: nameColor.id } },
    });
    assert.equal(giftRow.giftedByUserId, buyer.id, 'the gift remembers its sender');
    assert.equal(
      await prisma.userGoods.count({ where: { userId: buyer.id, goodsId: nameColor.id } }),
      0,
      'the buyer does not also get a copy',
    );

    // --- 5. insufficient funds ---------------------------------------------
    await assert.rejects(
      () => purchaseGoods({ goodsId: otherFrame.id, buyerUserId: poor.id }),
      (error: unknown) => error instanceof ApiError && error.statusCode === 400,
    );
    assert.equal(await walletOf(poor.id), 30);

    // --- 6. one equipped item per kind -------------------------------------
    await purchaseGoods({ goodsId: otherFrame.id, buyerUserId: buyer.id });
    await ShopService.equip(buyer.id, frame.id);
    let equipped = await ShopService.equip(buyer.id, otherFrame.id);
    assert.equal(equipped.frame?.goodsId, otherFrame.id);
    assert.equal(
      await prisma.userGoods.count({
        where: { userId: buyer.id, equipped: true, goods: { kind: GoodsKind.PROFILE_FRAME } },
      }),
      1,
      'equipping swaps rather than stacks',
    );
    equipped = await ShopService.unequip(buyer.id, otherFrame.id);
    assert.equal(equipped.frame, null);

    // A player cannot equip something they do not own.
    await assert.rejects(
      () => ShopService.equip(poor.id, frame.id),
      (error: unknown) => error instanceof ApiError && error.statusCode === 404,
    );

    // --- 7. the public projection ------------------------------------------
    await ShopService.equip(buyer.id, frame.id);
    await ShopService.equip(friend.id, nameColor.id);
    const publicEquipped = await ShopService.getPublicEquipped([buyer.id, friend.id, poor.id]);
    assert.equal(publicEquipped[buyer.id].frame?.assetKey, frame.assetKey);
    assert.equal(publicEquipped[buyer.id].nameColor, null);
    assert.equal(publicEquipped[friend.id].nameColor?.assetKey, nameColor.assetKey);
    assert.equal(publicEquipped[poor.id].frame, null, 'unknown users get an empty entry, not a hole');
    // Chat accents never appear in somebody else's projection.
    await ShopService.equip(premiumFriend.id, goldOnly.id);
    const accentPublic = await ShopService.getPublicEquipped([premiumFriend.id]);
    assert.deepEqual(Object.keys(accentPublic[premiumFriend.id]).sort(), ['frame', 'nameColor']);
    const ownView = await ShopService.readViewerEquipped(premiumFriend.id);
    assert.equal(ownView.chatAccent?.goodsId, goldOnly.id, 'the owner does see their own accent');

    // --- 8. catalogue only shows active items ------------------------------
    const catalog = await ShopService.getCatalog(buyer.id);
    const ids = catalog.items.map((entry) => entry.id);
    assert.ok(ids.includes(frame.id));
    assert.equal(catalog.balance, await walletOf(buyer.id));
    assert.equal(catalog.featured.some((entry) => entry.id === frame.id), true);
    assert.equal(
      catalog.items.find((entry) => entry.id === goldOnly.id)?.state,
      'PREMIUM_LOCKED',
      'a non-premium viewer sees the lock',
    );

    // --- 9. withdraw refunds every owner exactly once -----------------------
    const beforeBuyer = await walletOf(buyer.id);
    const beforeFriend = await walletOf(friend.id);
    const summary = await ShopAdminService.withdrawSummary(nameColor.id);
    assert.equal(summary.ownerCount, 1);
    assert.equal(summary.refundPerOwner, 80);

    await purchaseGoods({ goodsId: nameColor.id, buyerUserId: buyer.id });
    const spentOnSecondCopy = beforeBuyer - (await walletOf(buyer.id));
    assert.equal(spentOnSecondCopy, 80);

    const withdrawn = await ShopAdminService.withdraw(nameColor.id);
    assert.equal(withdrawn.refundedCount, 2, 'both owners refunded');
    assert.equal(withdrawn.totalRefund, 160);
    assert.equal(await walletOf(friend.id), beforeFriend + 80);
    assert.equal(await walletOf(buyer.id), beforeBuyer, 'the second copy cost is returned');
    assert.equal(
      await prisma.userGoods.count({ where: { goodsId: nameColor.id } }),
      0,
      'withdrawal clears ownership and therefore equipped state',
    );
    assert.equal(
      (await prisma.goods.findUniqueOrThrow({ where: { id: nameColor.id } })).isActive,
      false,
    );

    // Re-running must not pay anybody twice.
    const walletsAfter = await Promise.all([walletOf(buyer.id), walletOf(friend.id)]);
    const rerun = await ShopAdminService.withdraw(nameColor.id);
    assert.equal(rerun.refundedCount, 0, 'no owners left, no refunds');
    assert.deepEqual(await Promise.all([walletOf(buyer.id), walletOf(friend.id)]), walletsAfter);

    // Re-granting, re-buying and withdrawing again refunds the **new** ownership
    // instance: idempotency is per ownership, never per (user, goods) lifetime.
    // On the old lifetime check this paid nothing and still destroyed the item.
    await prisma.goods.update({ where: { id: nameColor.id }, data: { isActive: true } });
    await purchaseGoods({ goodsId: nameColor.id, buyerUserId: buyer.id });
    const beforeSecondWithdraw = await walletOf(buyer.id);
    assert.equal(beforeSecondWithdraw, walletsAfter[0] - 80, 'the re-buy is charged');
    const second = await ShopAdminService.withdraw(nameColor.id);
    assert.equal(second.refundedCount, 1, 'the second ownership is refunded too');
    assert.equal(second.skippedCount, 0);
    assert.equal(
      await walletOf(buyer.id),
      beforeSecondWithdraw + 80,
      'the second purchase price comes back',
    );
    assert.equal(
      await prisma.userGoods.count({ where: { goodsId: nameColor.id } }),
      0,
      'ownership is gone only because the refund landed',
    );
    assert.equal(
      await prisma.transactionRow.count({
        where: {
          goodsId: nameColor.id,
          transaction: { type: TransactionType.REFUND, toUserId: buyer.id },
        },
      }),
      2,
      'exactly one REFUND row per ownership instance',
    );

    // --- 10. a withdrawn item stays readable for history --------------------
    assert.equal(
      await prisma.transactionRow.count({ where: { goodsId: nameColor.id } }) > 0,
      true,
      'wallet history survives a withdrawal',
    );

    // --- 11. concurrent purchases of *different* items cannot overdraw ------
    // The regression: the balance check used to be a plain read inside a READ
    // COMMITTED transaction, so both of these passed it and the wallet went to
    // -100 with two items granted.
    const sprinter = await makeUser('sprinter', 100);
    const raceA = await makeGoods('raceA', GoodsKind.PROFILE_FRAME, 100);
    const raceB = await makeGoods('raceB', GoodsKind.NAME_COLOR, 100);
    const raced = await Promise.allSettled([
      purchaseGoods({ goodsId: raceA.id, buyerUserId: sprinter.id }),
      purchaseGoods({ goodsId: raceB.id, buyerUserId: sprinter.id }),
    ]);
    const settledRaces = raced.filter((result) => result.status === 'fulfilled');
    const refusedRaces = raced.filter((result) => result.status === 'rejected');
    assert.equal(settledRaces.length, 1, 'only one of two simultaneous buys may succeed');
    assert.equal(refusedRaces.length, 1);
    const refusal = (refusedRaces[0] as PromiseRejectedResult).reason;
    assert.ok(
      refusal instanceof ApiError && refusal.statusCode === 400,
      'the loser is refused for funds, not crashed',
    );
    assert.equal(await walletOf(sprinter.id), 0, 'the wallet never goes negative');
    assert.equal(
      await prisma.userGoods.count({ where: { userId: sprinter.id } }),
      1,
      'exactly one item was granted',
    );

    // --- 12. a gift may not cross a block ----------------------------------
    await prisma.blockedUser.create({
      data: { userId: friend.id, blockedUserId: buyer.id },
    });
    const blockedGift = await makeGoods('blocked', GoodsKind.CHAT_ACCENT, 10);
    const beforeBlockedGift = await walletOf(buyer.id);
    await assert.rejects(
      () =>
        purchaseGoods({
          goodsId: blockedGift.id,
          buyerUserId: buyer.id,
          recipientUserId: friend.id,
        }),
      (error: unknown) => error instanceof ApiError && error.statusCode === 404,
    );
    assert.equal(await walletOf(buyer.id), beforeBlockedGift, 'a refused gift spends nothing');
    assert.equal(
      await prisma.userGoods.count({ where: { userId: friend.id, goodsId: blockedGift.id } }),
      0,
    );

    console.log('shop.integration.test.ts: ok');
  } finally {
    await prisma.blockedUser.deleteMany({
      where: { OR: [{ userId: { in: userIds } }, { blockedUserId: { in: userIds } }] },
    });
    await prisma.transactionRow.deleteMany({ where: { goodsId: { in: goodsIds } } });
    await prisma.transaction.deleteMany({
      where: { OR: [{ fromUserId: { in: userIds } }, { toUserId: { in: userIds } }] },
    });
    await prisma.userGoods.deleteMany({ where: { goodsId: { in: goodsIds } } });
    await prisma.goods.deleteMany({ where: { id: { in: goodsIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
