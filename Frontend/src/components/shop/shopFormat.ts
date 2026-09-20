/**
 * PRD 355 — pure helpers for the shop's numbers and copy.
 *
 * Kept out of the `.tsx` files on purpose: a `.tsx` that exports a component
 * may export nothing else (`react-refresh/only-export-components`).
 */
import type { TFunction } from 'i18next';
import type { GoodsKind, ShopItem } from '@/api/shop';

/**
 * Which kinds can actually be *worn*.
 *
 * A sticker pack is unlocked by ownership — access is derived from `UserGoods`
 * rows, never from `equipped` — so offering Equip/Unequip on one would be a
 * control that does nothing. Mirrors `isEquippableKind` on the backend, which
 * rejects the call.
 */
export function isEquippableKind(kind: GoodsKind): boolean {
  return kind !== 'STICKER_PACK';
}

/** Coin amounts are grouped per locale ("1,250" / "1 250" / "١٢٥٠"). */
export function formatCoins(amount: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount);
  } catch {
    return String(amount);
  }
}

/**
 * The full "120 coins" phrase, correctly pluralized for the active locale.
 * Every price, balance and shortfall in the UI goes through this, so no locale
 * ever has to read a bare number next to a coin icon.
 */
export function coinsPhrase(t: TFunction, locale: string, amount: number): string {
  return t('shop.coins', { count: amount, formatted: formatCoins(amount, locale) });
}

/** What the confirm dialog shows as "Balance after". Never negative. */
export function balanceAfter(balance: number, price: number): number {
  return Math.max(0, balance - price);
}

/** How many more coins the viewer needs; `0` when they can afford it. */
export function coinsShortfall(balance: number, price: number): number {
  return Math.max(0, price - balance);
}

export function canAfford(balance: number, price: number): boolean {
  return balance >= price;
}

/** The i18n key for an item's action button. */
export function itemActionKey(item: ShopItem, balance: number): string {
  if (item.owned && !isEquippableKind(item.kind)) return 'shop.stickerPackUnlocked';
  if (item.equipped) return 'shop.unequip';
  if (item.owned) return 'shop.equip';
  if (item.state === 'PREMIUM_LOCKED') return 'shop.premiumLocked';
  if (!canAfford(balance, item.price)) return 'shop.needMoreCoins';
  return 'shop.buy';
}

/** Server rejection code (`data.reason`) → i18n key for the inline error. */
export function purchaseErrorKey(reason: string | undefined): string {
  switch (reason) {
    case 'ALREADY_OWNED':
      return 'shop.errorAlreadyOwned';
    case 'PREMIUM_ONLY':
      return 'shop.errorPremiumOnly';
    case 'INSUFFICIENT_FUNDS':
      return 'shop.errorInsufficientCoins';
    case 'SELF_GIFT':
      return 'shop.errorSelfGift';
    case 'NOT_AVAILABLE':
      return 'shop.errorNotAvailable';
    default:
      return 'shop.errorGeneric';
  }
}

/** Sort the grid the way the storefront reads: featured first, then price. */
export function sortShopItems(items: ShopItem[]): ShopItem[] {
  return [...items].sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.price - b.price;
  });
}

/** The three preview contexts the item sheet rotates through. */
export const SHOP_PREVIEW_CONTEXTS = ['profile', 'roster', 'chat'] as const;
export type ShopPreviewContext = (typeof SHOP_PREVIEW_CONTEXTS)[number];

/** Rotation is 2 s per context, as specified. */
export const SHOP_PREVIEW_ROTATION_MS = 2000;

export function nextPreviewContext(current: ShopPreviewContext): ShopPreviewContext {
  const index = SHOP_PREVIEW_CONTEXTS.indexOf(current);
  return SHOP_PREVIEW_CONTEXTS[(index + 1) % SHOP_PREVIEW_CONTEXTS.length];
}
