/**
 * PRD 355 — the player-facing cosmetics shop.
 *
 * Reads the catalogue, records ownership, equips at most one item per kind and
 * exposes the small public projection (`frame` / `nameColor`) that lets other
 * viewers render somebody else's cosmetics.
 */
import { GoodsKind, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { isEquippableKind, resolveShopItemState, SHOP_KIND_ORDER } from './shopRules';
import type {
  EquippedGoodsRef,
  PublicEquippedGoods,
  ShopCatalogItem,
  ShopCatalogResponse,
  ShopCollectionResponse,
  ViewerEquippedGoods,
} from './shop.types';

const CATALOG_SELECT = {
  id: true,
  kind: true,
  name: true,
  description: true,
  assetKey: true,
  previewUrl: true,
  price: true,
  isActive: true,
  isFeatured: true,
  premiumOnly: true,
  sortOrder: true,
  stickerPackId: true,
} as const;

type CatalogRow = Prisma.GoodsGetPayload<{ select: typeof CATALOG_SELECT }>;
type OwnershipRow = { goodsId: string; equipped: boolean; giftedByUserId: string | null };

const CATALOG_ORDER: Prisma.GoodsOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { price: 'asc' },
  { name: 'asc' },
];

function projectItem(row: CatalogRow, ownership: OwnershipRow | undefined, viewerIsPremium: boolean): ShopCatalogItem {
  const owned = Boolean(ownership);
  const equipped = Boolean(ownership?.equipped);
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    description: row.description,
    assetKey: row.assetKey,
    previewUrl: row.previewUrl,
    price: row.price,
    isFeatured: row.isFeatured,
    premiumOnly: row.premiumOnly,
    sortOrder: row.sortOrder,
    stickerPackId: row.stickerPackId,
    owned,
    equipped,
    giftedByUserId: ownership?.giftedByUserId ?? null,
    state: resolveShopItemState({ owned, equipped, premiumOnly: row.premiumOnly, viewerIsPremium }),
  };
}

function toRef(row: { id: string; assetKey: string; name: string }): EquippedGoodsRef {
  return { goodsId: row.id, assetKey: row.assetKey, name: row.name };
}

async function readViewer(userId: string): Promise<{ wallet: number; isPremium: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wallet: true, isPremium: true },
  });
  if (!user) {
    throw new ApiError(404, 'shop.buyerNotFound', true, { code: 'shop.buyerNotFound' });
  }
  return user;
}

async function readOwnership(userId: string): Promise<Map<string, OwnershipRow>> {
  const rows = await prisma.userGoods.findMany({
    where: { userId },
    select: { goodsId: true, equipped: true, giftedByUserId: true },
  });
  return new Map(rows.map((row) => [row.goodsId, row]));
}

export class ShopService {
  /** The storefront: active items only, plus the viewer's ownership state. */
  static async getCatalog(userId: string, kind?: GoodsKind): Promise<ShopCatalogResponse> {
    const [viewer, ownership, rows] = await Promise.all([
      readViewer(userId),
      readOwnership(userId),
      prisma.goods.findMany({
        where: { isActive: true, ...(kind ? { kind } : {}) },
        select: CATALOG_SELECT,
        orderBy: CATALOG_ORDER,
      }),
    ]);

    const items = rows.map((row) => projectItem(row, ownership.get(row.id), viewer.isPremium));
    return {
      balance: viewer.wallet,
      viewerIsPremium: viewer.isPremium,
      items,
      featured: items.filter((item) => item.isFeatured),
    };
  }

  /** One item, for the item sheet and for deep links into the shop. */
  static async getItem(userId: string, goodsId: string): Promise<ShopCatalogItem> {
    const [viewer, row, ownership] = await Promise.all([
      readViewer(userId),
      prisma.goods.findUnique({ where: { id: goodsId }, select: CATALOG_SELECT }),
      prisma.userGoods.findUnique({
        where: { userId_goodsId: { userId, goodsId } },
        select: { goodsId: true, equipped: true, giftedByUserId: true },
      }),
    ]);
    // A withdrawn item stays readable for whoever still owns it, so their
    // collection never renders a hole.
    if (!row || (!row.isActive && !ownership)) {
      throw new ApiError(404, 'shop.itemNotAvailable', true, { code: 'shop.itemNotAvailable' });
    }
    return projectItem(row, ownership ?? undefined, viewer.isPremium);
  }

  /** Profile → Appearance → Collection. */
  static async getCollection(userId: string): Promise<ShopCollectionResponse> {
    const [viewer, ownership] = await Promise.all([readViewer(userId), readOwnership(userId)]);
    const goodsIds = [...ownership.keys()];
    const rows = goodsIds.length
      ? await prisma.goods.findMany({
          where: { id: { in: goodsIds } },
          select: CATALOG_SELECT,
          orderBy: CATALOG_ORDER,
        })
      : [];

    const items = rows.map((row) => projectItem(row, ownership.get(row.id), viewer.isPremium));
    return {
      balance: viewer.wallet,
      viewerIsPremium: viewer.isPremium,
      items,
      equipped: ShopService.projectViewerEquipped(rows, ownership),
    };
  }

  private static projectViewerEquipped(
    rows: CatalogRow[],
    ownership: Map<string, OwnershipRow>,
  ): ViewerEquippedGoods {
    const equippedOf = (kind: GoodsKind): EquippedGoodsRef | null => {
      const row = rows.find((candidate) => candidate.kind === kind && ownership.get(candidate.id)?.equipped);
      return row ? toRef(row) : null;
    };
    return {
      frame: equippedOf(GoodsKind.PROFILE_FRAME),
      nameColor: equippedOf(GoodsKind.NAME_COLOR),
      chatAccent: equippedOf(GoodsKind.CHAT_ACCENT),
    };
  }

  /**
   * Equip one owned item. **One per kind**: the swap and the unequip of the
   * previous item of that kind happen in one transaction, so a viewer can never
   * observe two equipped frames.
   */
  static async equip(userId: string, goodsId: string): Promise<ViewerEquippedGoods> {
    const owned = await prisma.userGoods.findUnique({
      where: { userId_goodsId: { userId, goodsId } },
      select: { id: true, goods: { select: { kind: true } } },
    });
    if (!owned) {
      throw new ApiError(404, 'shop.notOwned', true, { code: 'shop.notOwned' });
    }
    // Sticker packs are unlocked by ownership and have nothing to equip.
    if (!isEquippableKind(owned.goods.kind)) {
      throw new ApiError(400, 'shop.notEquippable', true, { code: 'shop.notEquippable' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.userGoods.updateMany({
        where: { userId, equipped: true, goods: { kind: owned.goods.kind }, NOT: { id: owned.id } },
        data: { equipped: false },
      });
      await tx.userGoods.update({ where: { id: owned.id }, data: { equipped: true } });
    });

    return ShopService.readViewerEquipped(userId);
  }

  static async unequip(userId: string, goodsId: string): Promise<ViewerEquippedGoods> {
    const updated = await prisma.userGoods.updateMany({
      where: { userId, goodsId },
      data: { equipped: false },
    });
    if (updated.count === 0) {
      throw new ApiError(404, 'shop.notOwned', true, { code: 'shop.notOwned' });
    }
    return ShopService.readViewerEquipped(userId);
  }

  static async readViewerEquipped(userId: string): Promise<ViewerEquippedGoods> {
    const rows = await prisma.userGoods.findMany({
      where: { userId, equipped: true },
      select: { goods: { select: { id: true, kind: true, assetKey: true, name: true } } },
    });
    const pick = (kind: GoodsKind): EquippedGoodsRef | null => {
      const match = rows.find((row) => row.goods.kind === kind);
      return match ? toRef(match.goods) : null;
    };
    return {
      frame: pick(GoodsKind.PROFILE_FRAME),
      nameColor: pick(GoodsKind.NAME_COLOR),
      chatAccent: pick(GoodsKind.CHAT_ACCENT),
    };
  }

  /**
   * The public projection: what *other* people's equipped cosmetics look like.
   * Chat accents are excluded on purpose — they only paint the owner's own
   * outgoing bubbles and never leave the owner's session.
   */
  static async getPublicEquipped(userIds: string[]): Promise<Record<string, PublicEquippedGoods>> {
    const unique = [...new Set(userIds.filter(Boolean))];
    const result: Record<string, PublicEquippedGoods> = {};
    for (const id of unique) result[id] = { frame: null, nameColor: null };
    if (unique.length === 0) return result;

    const rows = await prisma.userGoods.findMany({
      where: {
        userId: { in: unique },
        equipped: true,
        goods: { kind: { in: [GoodsKind.PROFILE_FRAME, GoodsKind.NAME_COLOR] } },
      },
      select: {
        userId: true,
        goods: { select: { id: true, kind: true, assetKey: true, name: true } },
      },
    });

    for (const row of rows) {
      const bucket = result[row.userId];
      if (!bucket) continue;
      if (row.goods.kind === GoodsKind.PROFILE_FRAME) bucket.frame = toRef(row.goods);
      if (row.goods.kind === GoodsKind.NAME_COLOR) bucket.nameColor = toRef(row.goods);
    }
    return result;
  }

  /** Ordered category chips, so the frontend never hard-codes the enum order. */
  static listKinds(): readonly GoodsKind[] {
    return SHOP_KIND_ORDER;
  }
}
