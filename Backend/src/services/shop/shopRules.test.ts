/**
 * PRD 355 — the shop's pure rules.
 *
 * The premium gate and the "already owned" guard are server rules; this file
 * pins them without a database so a refactor cannot quietly move the gate into
 * the UI.
 */
import assert from 'node:assert/strict';
import { GoodsKind } from '@prisma/client';
import {
  coinsShortfall,
  isShopKind,
  rejectPurchase,
  rejectSelfGift,
  resolveShopItemState,
  SHOP_KIND_ORDER,
  SHOP_REJECTION_CODE,
  SHOP_REJECTION_STATUS,
} from './shopRules';

const item = { price: 120, isActive: true, premiumOnly: false };
const premiumItem = { ...item, premiumOnly: true };

// --- state resolution -------------------------------------------------------
assert.equal(
  resolveShopItemState({ owned: false, equipped: false, premiumOnly: false, viewerIsPremium: false }),
  'BUY',
);
assert.equal(
  resolveShopItemState({ owned: false, equipped: false, premiumOnly: true, viewerIsPremium: false }),
  'PREMIUM_LOCKED',
);
assert.equal(
  resolveShopItemState({ owned: false, equipped: false, premiumOnly: true, viewerIsPremium: true }),
  'BUY',
);
assert.equal(
  resolveShopItemState({ owned: true, equipped: false, premiumOnly: false, viewerIsPremium: false }),
  'OWNED',
);
assert.equal(
  resolveShopItemState({ owned: true, equipped: true, premiumOnly: false, viewerIsPremium: false }),
  'EQUIPPED',
);
// Lapsed membership must not repossess a paid-for item.
assert.equal(
  resolveShopItemState({ owned: true, equipped: true, premiumOnly: true, viewerIsPremium: false }),
  'EQUIPPED',
);

// --- the purchase gate ------------------------------------------------------
const base = {
  item,
  buyerUserId: 'buyer',
  buyerBalance: 500,
  ownerUserId: 'buyer',
  ownerIsPremium: false,
  ownerAlreadyOwns: false,
};

assert.equal(rejectPurchase(base), null);
assert.equal(rejectPurchase({ ...base, item: { ...item, isActive: false } }), 'NOT_AVAILABLE');
assert.equal(rejectPurchase({ ...base, ownerAlreadyOwns: true }), 'ALREADY_OWNED');
assert.equal(rejectPurchase({ ...base, item: premiumItem }), 'PREMIUM_ONLY');
assert.equal(rejectPurchase({ ...base, item: premiumItem, ownerIsPremium: true }), null);
assert.equal(rejectPurchase({ ...base, buyerBalance: 119 }), 'INSUFFICIENT_FUNDS');
assert.equal(rejectPurchase({ ...base, buyerBalance: 120 }), null, 'exact balance is enough');
// Gifting a premium item follows the recipient's membership, not the payer's.
assert.equal(
  rejectPurchase({ ...base, item: premiumItem, ownerUserId: 'friend', ownerIsPremium: false }),
  'PREMIUM_ONLY',
);
assert.equal(
  rejectPurchase({ ...base, item: premiumItem, ownerUserId: 'friend', ownerIsPremium: true }),
  null,
);
// Ownership is checked before affordability: an owner never sees "buy more coins".
assert.equal(
  rejectPurchase({ ...base, ownerAlreadyOwns: true, buyerBalance: 0 }),
  'ALREADY_OWNED',
);

assert.equal(rejectSelfGift('a', 'a'), 'SELF_GIFT');
assert.equal(rejectSelfGift('a', 'b'), null);

// --- confirm-dialog maths ---------------------------------------------------
assert.equal(coinsShortfall(80, 120), 40);
assert.equal(coinsShortfall(120, 120), 0);
assert.equal(coinsShortfall(500, 120), 0);

// --- category chips ---------------------------------------------------------
assert.deepEqual(SHOP_KIND_ORDER, [
  GoodsKind.PROFILE_FRAME,
  GoodsKind.CHAT_ACCENT,
  GoodsKind.STICKER_PACK,
  GoodsKind.NAME_COLOR,
]);
assert.equal(isShopKind('PROFILE_FRAME'), true);
assert.equal(isShopKind('NOT_A_KIND'), false);
assert.equal(isShopKind(undefined), false);

for (const rejection of Object.keys(SHOP_REJECTION_STATUS)) {
  assert.ok(SHOP_REJECTION_CODE[rejection as keyof typeof SHOP_REJECTION_CODE].startsWith('shop.'));
}
assert.equal(SHOP_REJECTION_STATUS.PREMIUM_ONLY, 403);
assert.equal(SHOP_REJECTION_STATUS.ALREADY_OWNED, 409);

console.log('shopRules.test.ts: ok');
