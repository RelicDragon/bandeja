/**
 * PRD 355 — cosmetics shop wire types.
 *
 * Mirrored by `Frontend/src/api/shop.ts`. There is no generated client, so a
 * change here is a change there in the same commit.
 */
import type { GoodsKind } from '@prisma/client';

/** What the card / sheet button offers for one catalogue row. */
export type ShopItemState = 'BUY' | 'OWNED' | 'EQUIPPED' | 'PREMIUM_LOCKED';

/** Why a purchase was refused. Mirrors the `shop.*` i18n error keys. */
export type ShopPurchaseRejection =
  | 'NOT_AVAILABLE'
  | 'ALREADY_OWNED'
  | 'PREMIUM_ONLY'
  | 'INSUFFICIENT_FUNDS'
  | 'SELF_GIFT';

export interface ShopCatalogItem {
  id: string;
  kind: GoodsKind;
  name: string;
  description: string | null;
  /** CSS class id in `Frontend/src/styles/collection.css` (sticker-pack key for STICKER_PACK). */
  assetKey: string;
  previewUrl: string | null;
  price: number;
  isFeatured: boolean;
  premiumOnly: boolean;
  sortOrder: number;
  stickerPackId: string | null;
  owned: boolean;
  equipped: boolean;
  /**
   * Set when the viewer received this item as a gift. The "sparkle on first
   * open" is a client-side affordance keyed on this id — there is no
   * `seenAt` column, so the frontend remembers which gifts it has celebrated.
   */
  giftedByUserId: string | null;
  state: ShopItemState;
}

export interface ShopCatalogResponse {
  /** The viewer's coin balance, so the shop never needs a second round trip. */
  balance: number;
  viewerIsPremium: boolean;
  items: ShopCatalogItem[];
  featured: ShopCatalogItem[];
}

/** One equipped cosmetic, as any viewer may see it. */
export interface EquippedGoodsRef {
  goodsId: string;
  assetKey: string;
  name: string;
}

/**
 * Publicly visible equipped cosmetics. `chatAccent` is deliberately absent:
 * the accent only ever paints the owner's *own* outgoing bubbles, so it is
 * viewer-local and never leaves the owner's session.
 */
export interface PublicEquippedGoods {
  frame: EquippedGoodsRef | null;
  nameColor: EquippedGoodsRef | null;
}

/** The viewer's own equipped set — includes the viewer-local chat accent. */
export interface ViewerEquippedGoods extends PublicEquippedGoods {
  chatAccent: EquippedGoodsRef | null;
}

export interface ShopCollectionResponse {
  balance: number;
  viewerIsPremium: boolean;
  items: ShopCatalogItem[];
  equipped: ViewerEquippedGoods;
}

export interface ShopPurchaseResponse {
  item: ShopCatalogItem;
  /** The payer's balance after the purchase settled. */
  balance: number;
  transactionId: string;
  /** Set when the item was bought for somebody else. */
  recipientUserId: string | null;
}

/** A row of the admin catalogue table. */
export interface AdminGoodsRow {
  id: string;
  kind: GoodsKind;
  name: string;
  description: string | null;
  assetKey: string;
  previewUrl: string | null;
  price: number;
  isActive: boolean;
  isFeatured: boolean;
  premiumOnly: boolean;
  sortOrder: number;
  stickerPackId: string | null;
  /** How many players own it — the refund blast radius. */
  salesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminGoodsWithdrawSummary {
  goodsId: string;
  ownerCount: number;
  refundPerOwner: number;
  totalRefund: number;
}

export interface AdminGoodsWithdrawResult extends AdminGoodsWithdrawSummary {
  refundedCount: number;
  /** Owners who already had a refund row and were therefore skipped. */
  skippedCount: number;
}
