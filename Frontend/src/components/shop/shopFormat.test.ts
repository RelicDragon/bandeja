import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { ShopItem } from '@/api/shop';
import {
  balanceAfter,
  canAfford,
  coinsPhrase,
  coinsShortfall,
  formatCoins,
  isEquippableKind,
  itemActionKey,
  nextPreviewContext,
  purchaseErrorKey,
  SHOP_PREVIEW_CONTEXTS,
  SHOP_PREVIEW_ROTATION_MS,
  sortShopItems,
} from './shopFormat';

function item(overrides: Partial<ShopItem> = {}): ShopItem {
  return {
    id: 'g1',
    kind: 'PROFILE_FRAME',
    name: 'Neon Frame',
    description: null,
    assetKey: 'frame-neon',
    previewUrl: null,
    price: 120,
    isFeatured: false,
    premiumOnly: false,
    sortOrder: 0,
    stickerPackId: null,
    owned: false,
    equipped: false,
    giftedByUserId: null,
    state: 'BUY',
    ...overrides,
  };
}

describe('confirm dialog maths', () => {
  it('shows the balance after the purchase', () => {
    expect(balanceAfter(500, 120)).toBe(380);
  });

  it('never shows a negative balance', () => {
    expect(balanceAfter(80, 120)).toBe(0);
  });

  it('reports the exact shortfall', () => {
    expect(coinsShortfall(80, 120)).toBe(40);
    expect(coinsShortfall(120, 120)).toBe(0);
    expect(coinsShortfall(500, 120)).toBe(0);
  });

  it('treats an exact balance as affordable', () => {
    expect(canAfford(120, 120)).toBe(true);
    expect(canAfford(119, 120)).toBe(false);
  });
});

describe('coin formatting', () => {
  it('groups thousands per locale', () => {
    expect(formatCoins(1250, 'en')).toBe('1,250');
    expect(formatCoins(1250, 'de')).toBe('1.250');
  });

  it('falls back to the raw number for a broken locale tag', () => {
    expect(formatCoins(120, 'not a locale')).toBe('120');
  });

  it('builds the full phrase through the plural-aware key', () => {
    const calls: { key: string; options: Record<string, unknown> }[] = [];
    const t = ((key: string, options: Record<string, unknown>) => {
      calls.push({ key, options });
      return `${options.formatted} coins`;
    }) as unknown as TFunction;

    expect(coinsPhrase(t, 'en', 1250)).toBe('1,250 coins');
    expect(calls[0].key).toBe('shop.coins');
    expect(calls[0].options.count).toBe(1250);
    expect(calls[0].options.formatted).toBe('1,250');
  });
});

describe('card and button state', () => {
  it('offers Buy when affordable and unowned', () => {
    expect(itemActionKey(item(), 500)).toBe('shop.buy');
  });

  it('asks for more coins when the balance is short', () => {
    expect(itemActionKey(item(), 80)).toBe('shop.needMoreCoins');
  });

  it('locks a premium item before it looks at the balance', () => {
    expect(itemActionKey(item({ state: 'PREMIUM_LOCKED' }), 0)).toBe('shop.premiumLocked');
  });

  it('offers Equip once owned and Unequip once equipped', () => {
    expect(itemActionKey(item({ owned: true, state: 'OWNED' }), 0)).toBe('shop.equip');
    expect(itemActionKey(item({ owned: true, equipped: true, state: 'EQUIPPED' }), 0)).toBe(
      'shop.unequip',
    );
  });

  it('says an owned sticker pack is unlocked rather than equippable', () => {
    expect(isEquippableKind('STICKER_PACK')).toBe(false);
    expect(isEquippableKind('PROFILE_FRAME')).toBe(true);
    expect(
      itemActionKey(item({ kind: 'STICKER_PACK', owned: true, state: 'OWNED' }), 0),
    ).toBe('shop.stickerPackUnlocked');
    // Unowned it is still a normal purchase.
    expect(itemActionKey(item({ kind: 'STICKER_PACK' }), 500)).toBe('shop.buy');
  });
});

describe('purchase errors', () => {
  it('maps every server rejection to its own message', () => {
    expect(purchaseErrorKey('ALREADY_OWNED')).toBe('shop.errorAlreadyOwned');
    expect(purchaseErrorKey('PREMIUM_ONLY')).toBe('shop.errorPremiumOnly');
    expect(purchaseErrorKey('INSUFFICIENT_FUNDS')).toBe('shop.errorInsufficientCoins');
    expect(purchaseErrorKey('SELF_GIFT')).toBe('shop.errorSelfGift');
    expect(purchaseErrorKey('NOT_AVAILABLE')).toBe('shop.errorNotAvailable');
  });

  it('falls back to a generic message that promises nothing was spent', () => {
    expect(purchaseErrorKey(undefined)).toBe('shop.errorGeneric');
    expect(purchaseErrorKey('SOMETHING_NEW')).toBe('shop.errorGeneric');
  });
});

describe('grid ordering', () => {
  it('puts featured items first, then sortOrder, then price', () => {
    const items = [
      item({ id: 'c', price: 50, sortOrder: 2 }),
      item({ id: 'a', price: 300, isFeatured: true }),
      item({ id: 'b', price: 10, sortOrder: 2 }),
    ];
    expect(sortShopItems(items).map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate its input', () => {
    const items = [item({ id: 'x' }), item({ id: 'y', isFeatured: true })];
    sortShopItems(items);
    expect(items.map((entry) => entry.id)).toEqual(['x', 'y']);
  });
});

describe('preview rotation', () => {
  it('cycles profile → roster → chat → profile', () => {
    expect(SHOP_PREVIEW_CONTEXTS).toEqual(['profile', 'roster', 'chat']);
    expect(nextPreviewContext('profile')).toBe('roster');
    expect(nextPreviewContext('roster')).toBe('chat');
    expect(nextPreviewContext('chat')).toBe('profile');
  });

  it('rotates every two seconds, as specified', () => {
    expect(SHOP_PREVIEW_ROTATION_MS).toBe(2000);
  });
});
