/**
 * PRD 355 — the shop's pure decision rules.
 *
 * Everything in this file is side-effect free so the purchase gate can be unit
 * tested without a database. The service layer is the only place allowed to
 * turn a rejection into an `ApiError`, and it must always ask this module
 * first: **the premium gate is a server rule, never a UI rule.**
 */
import { GoodsKind } from '@prisma/client';
import type { ShopItemState, ShopPurchaseRejection } from './shop.types';

/** The catalogue categories, in the order the chips render. */
export const SHOP_KIND_ORDER: readonly GoodsKind[] = [
  GoodsKind.PROFILE_FRAME,
  GoodsKind.CHAT_ACCENT,
  GoodsKind.STICKER_PACK,
  GoodsKind.NAME_COLOR,
];

export function isShopKind(value: unknown): value is GoodsKind {
  return typeof value === 'string' && SHOP_KIND_ORDER.includes(value as GoodsKind);
}

/**
 * The kinds that can actually be *worn*. Only these are projected by
 * `ViewerEquippedGoods` / `PublicEquippedGoods`.
 *
 * A sticker pack is **unlocked**, not equipped: `UserStickerPrefs` access is
 * derived from ownership alone (`shopStickerAccess.ts`), so flipping
 * `UserGoods.equipped` on a pack would change nothing anywhere in the app.
 * Rejecting it here keeps the UI from offering a control that does nothing.
 */
export const EQUIPPABLE_GOODS_KINDS: readonly GoodsKind[] = [
  GoodsKind.PROFILE_FRAME,
  GoodsKind.CHAT_ACCENT,
  GoodsKind.NAME_COLOR,
];

export function isEquippableKind(kind: GoodsKind): boolean {
  return EQUIPPABLE_GOODS_KINDS.includes(kind);
}

export interface ShopItemStateInput {
  owned: boolean;
  equipped: boolean;
  premiumOnly: boolean;
  viewerIsPremium: boolean;
}

/**
 * Owning an item always wins over the premium lock: a player who bought a
 * premium item and then let membership lapse keeps what they paid for.
 */
export function resolveShopItemState(input: ShopItemStateInput): ShopItemState {
  if (input.equipped) return 'EQUIPPED';
  if (input.owned) return 'OWNED';
  if (input.premiumOnly && !input.viewerIsPremium) return 'PREMIUM_LOCKED';
  return 'BUY';
}

export interface PurchaseGateInput {
  /** The catalogue row, as read inside the purchase transaction. */
  item: { price: number; isActive: boolean; premiumOnly: boolean };
  /** Who pays. */
  buyerUserId: string;
  buyerBalance: number;
  /** Who ends up owning the row — the buyer, or the gift recipient. */
  ownerUserId: string;
  /** Premium flag of the **owner**: the perk follows the item, not the wallet. */
  ownerIsPremium: boolean;
  ownerAlreadyOwns: boolean;
}

/**
 * The single source of truth for "may this purchase happen?".
 * Returns `null` when the purchase is allowed.
 */
export function rejectPurchase(input: PurchaseGateInput): ShopPurchaseRejection | null {
  if (!input.item.isActive) return 'NOT_AVAILABLE';
  if (input.ownerAlreadyOwns) return 'ALREADY_OWNED';
  if (input.item.premiumOnly && !input.ownerIsPremium) return 'PREMIUM_ONLY';
  if (input.buyerBalance < input.item.price) return 'INSUFFICIENT_FUNDS';
  return null;
}

/** Guard for the gift endpoint: gifting yourself is just a purchase. */
export function rejectSelfGift(buyerUserId: string, recipientUserId: string): ShopPurchaseRejection | null {
  return buyerUserId === recipientUserId ? 'SELF_GIFT' : null;
}

/** How many more coins the viewer needs. Never negative. */
export function coinsShortfall(balance: number, price: number): number {
  return Math.max(0, price - balance);
}

/** HTTP status for each rejection, so the controller stays declarative. */
export const SHOP_REJECTION_STATUS: Record<ShopPurchaseRejection, number> = {
  NOT_AVAILABLE: 404,
  ALREADY_OWNED: 409,
  PREMIUM_ONLY: 403,
  INSUFFICIENT_FUNDS: 400,
  SELF_GIFT: 400,
};

/** i18n key for each rejection (resolved by the frontend, never shown raw). */
export const SHOP_REJECTION_CODE: Record<ShopPurchaseRejection, string> = {
  NOT_AVAILABLE: 'shop.itemNotAvailable',
  ALREADY_OWNED: 'shop.alreadyOwned',
  PREMIUM_ONLY: 'shop.premiumOnly',
  INSUFFICIENT_FUNDS: 'shop.insufficientCoins',
  SELF_GIFT: 'shop.cannotGiftYourself',
};
