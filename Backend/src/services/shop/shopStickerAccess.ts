/**
 * PRD 355 — sticker packs sold in the shop.
 *
 * A pack becomes purchasable by pointing an active `Goods` row of kind
 * `STICKER_PACK` at it through the real `Goods.stickerPackId` foreign key.
 * From that moment the pack is hidden from everybody who does not own that
 * catalogue row — in the picker, when opening the pack, and when sending one of
 * its stickers. There is no `assetKey` string matching anywhere: the FK is the
 * link.
 */
import { GoodsKind } from '@prisma/client';
import prisma from '../../config/database';

/** Pack ids that are gated behind an active shop item. */
export async function getShopGatedStickerPackIds(): Promise<string[]> {
  const rows = await prisma.goods.findMany({
    where: { kind: GoodsKind.STICKER_PACK, isActive: true, stickerPackId: { not: null } },
    select: { stickerPackId: true },
  });
  return rows.flatMap((row) => (row.stickerPackId ? [row.stickerPackId] : []));
}

/** Pack ids this user has bought (or been gifted). */
export async function getOwnedStickerPackIds(userId: string): Promise<string[]> {
  const rows = await prisma.userGoods.findMany({
    where: { userId, goods: { kind: GoodsKind.STICKER_PACK, stickerPackId: { not: null } } },
    select: { goods: { select: { stickerPackId: true } } },
  });
  return rows.flatMap((row) => (row.goods.stickerPackId ? [row.goods.stickerPackId] : []));
}

/**
 * Pack ids this user must not see: gated by the shop and not owned.
 * Returns an empty array when nothing is gated, so the common case adds one
 * cheap indexed query and no `notIn` clause at all.
 */
export async function getLockedStickerPackIdsForUser(userId: string | undefined): Promise<string[]> {
  const gated = await getShopGatedStickerPackIds();
  if (gated.length === 0) return [];
  if (!userId) return gated;
  const owned = new Set(await getOwnedStickerPackIds(userId));
  return gated.filter((packId) => !owned.has(packId));
}

/** True when the user may use the pack (not gated, or owned). */
export async function canUseStickerPack(packId: string, userId: string | undefined): Promise<boolean> {
  const locked = await getLockedStickerPackIdsForUser(userId);
  return !locked.includes(packId);
}
