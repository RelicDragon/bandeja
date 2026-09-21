import api from './axios';

/**
 * PRD 355 — the cosmetics shop.
 *
 * Mirrors `Backend/src/services/shop/shop.types.ts`. There is no generated
 * client, so changing one means changing the other in the same change.
 *
 * Prices are whole coins. Coins are never purchasable with real money.
 */

export type GoodsKind = 'PROFILE_FRAME' | 'CHAT_ACCENT' | 'STICKER_PACK' | 'NAME_COLOR';

export type ShopItemState = 'BUY' | 'OWNED' | 'EQUIPPED' | 'PREMIUM_LOCKED';

export type ShopPurchaseRejection =
  | 'NOT_AVAILABLE'
  | 'ALREADY_OWNED'
  | 'PREMIUM_ONLY'
  | 'INSUFFICIENT_FUNDS'
  | 'SELF_GIFT';

export interface ShopItem {
  id: string;
  kind: GoodsKind;
  name: string;
  description: string | null;
  assetKey: string;
  previewUrl: string | null;
  price: number;
  isFeatured: boolean;
  premiumOnly: boolean;
  sortOrder: number;
  stickerPackId: string | null;
  owned: boolean;
  equipped: boolean;
  giftedByUserId: string | null;
  state: ShopItemState;
}

export interface ShopCatalog {
  balance: number;
  viewerIsPremium: boolean;
  items: ShopItem[];
  featured: ShopItem[];
}

export interface EquippedGoodsRef {
  goodsId: string;
  assetKey: string;
  name: string;
}

/** What any viewer may see. Chat accents are viewer-local and never included. */
export interface PublicEquippedGoods {
  frame: EquippedGoodsRef | null;
  nameColor: EquippedGoodsRef | null;
}

export interface ViewerEquippedGoods extends PublicEquippedGoods {
  chatAccent: EquippedGoodsRef | null;
}

export interface ShopCollection {
  balance: number;
  viewerIsPremium: boolean;
  items: ShopItem[];
  equipped: ViewerEquippedGoods;
}

export interface ShopPurchaseResult {
  item: ShopItem;
  balance: number;
  transactionId: string;
  recipientUserId: string | null;
}

export const shopApi = {
  async getCatalog(kind?: GoodsKind): Promise<ShopCatalog> {
    const response = await api.get<{ success: boolean; data: ShopCatalog }>('/shop/catalog', {
      params: kind ? { kind } : undefined,
    });
    return response.data.data;
  },

  async getCollection(): Promise<ShopCollection> {
    const response = await api.get<{ success: boolean; data: ShopCollection }>('/shop/me/goods');
    return response.data.data;
  },

  async purchase(goodsId: string, recipientUserId?: string): Promise<ShopPurchaseResult> {
    const response = await api.post<{ success: boolean; data: ShopPurchaseResult }>('/shop/purchase', {
      goodsId,
      ...(recipientUserId ? { recipientUserId } : {}),
    });
    return response.data.data;
  },

  async equip(goodsId: string): Promise<ViewerEquippedGoods> {
    const response = await api.put<{ success: boolean; data: ViewerEquippedGoods }>(
      `/shop/me/goods/${goodsId}/equip`,
    );
    return response.data.data;
  },

  async unequip(goodsId: string): Promise<ViewerEquippedGoods> {
    const response = await api.put<{ success: boolean; data: ViewerEquippedGoods }>(
      `/shop/me/goods/${goodsId}/unequip`,
    );
    return response.data.data;
  },

  /** Batch lookup so a roster of avatars costs one request, not one per player. */
  async getEquippedForUsers(userIds: string[]): Promise<Record<string, PublicEquippedGoods>> {
    if (userIds.length === 0) return {};
    const response = await api.get<{ success: boolean; data: Record<string, PublicEquippedGoods> }>(
      '/shop/equipped',
      { params: { userIds: userIds.join(',') } },
    );
    return response.data.data;
  },
};
