import prisma from '../../config/database';
import type { Sport } from '@prisma/client';
import { MAX_STICKER_FAVORITES, MAX_STICKER_RECENT } from './stickerConstants';
import { ApiError } from '../../utils/ApiError';

export type StickerPackListItem = {
  id: string;
  slug: string;
  title: string;
  sport: Sport | null;
  locale: string | null;
  isOfficial: boolean;
  sortOrder: number;
  stickerCount: number;
  coverSticker: {
    id: string;
    slug: string;
    emoji: string;
    staticUrl: string;
    animatedUrl: string | null;
    width: number;
    height: number;
  } | null;
};

export type StickerDto = {
  id: string;
  packId: string;
  slug: string;
  emoji: string;
  title: string | null;
  staticUrl: string;
  animatedUrl: string | null;
  width: number;
  height: number;
  sortOrder: number;
  isActive: boolean;
};

function mapSticker(s: {
  id: string;
  packId: string;
  slug: string;
  emoji: string;
  title: string | null;
  staticUrl: string;
  animatedUrl: string | null;
  width: number;
  height: number;
  sortOrder: number;
  isActive: boolean;
}): StickerDto {
  return {
    id: s.id,
    packId: s.packId,
    slug: s.slug,
    emoji: s.emoji,
    title: s.title,
    staticUrl: s.staticUrl,
    animatedUrl: s.animatedUrl,
    width: s.width,
    height: s.height,
    sortOrder: s.sortOrder,
    isActive: s.isActive,
  };
}

function mapPackListItem(p: {
  id: string;
  slug: string;
  title: string;
  sport: Sport | null;
  locale: string | null;
  isOfficial: boolean;
  sortOrder: number;
  coverSticker: {
    id: string;
    slug: string;
    emoji: string;
    staticUrl: string;
    animatedUrl: string | null;
    width: number;
    height: number;
  } | null;
  _count: { stickers: number };
}): StickerPackListItem {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    sport: p.sport,
    locale: p.locale,
    isOfficial: p.isOfficial,
    sortOrder: p.sortOrder,
    stickerCount: p._count.stickers,
    coverSticker: p.coverSticker
      ? {
          id: p.coverSticker.id,
          slug: p.coverSticker.slug,
          emoji: p.coverSticker.emoji,
          staticUrl: p.coverSticker.staticUrl,
          animatedUrl: p.coverSticker.animatedUrl,
          width: p.coverSticker.width,
          height: p.coverSticker.height,
        }
      : null,
  };
}

const packInclude = {
  coverSticker: {
    select: {
      id: true,
      slug: true,
      emoji: true,
      staticUrl: true,
      animatedUrl: true,
      width: true,
      height: true,
    },
  },
  _count: { select: { stickers: { where: { isActive: true } } } },
} as const;

export async function listStickerPacks(opts?: {
  sport?: Sport | null;
}): Promise<StickerPackListItem[]> {
  const packs = await prisma.stickerPack.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    include: packInclude,
  });

  const sport = opts?.sport ?? null;
  const sorted =
    sport == null
      ? packs
      : [...packs].sort((a, b) => {
          const aMatch = a.sport === sport ? 0 : a.sport == null ? 1 : 2;
          const bMatch = b.sport === sport ? 0 : b.sport == null ? 1 : 2;
          if (aMatch !== bMatch) return aMatch - bMatch;
          return a.sortOrder - b.sortOrder;
        });

  return sorted.map(mapPackListItem);
}

export async function getStickerPackById(packId: string): Promise<{
  pack: StickerPackListItem;
  stickers: StickerDto[];
}> {
  const pack = await prisma.stickerPack.findFirst({
    where: { id: packId, isActive: true },
    include: {
      ...packInclude,
      stickers: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  if (!pack) {
    throw new ApiError(404, 'Sticker pack not found', true, { code: 'sticker.packNotFound' });
  }

  return {
    pack: mapPackListItem(pack),
    stickers: pack.stickers.map(mapSticker),
  };
}

/** Hydrate by id — returns inactive rows so historical messages can still resolve assets. */
export async function getStickerById(
  stickerId: string
): Promise<StickerDto & { isActive: boolean; packActive: boolean }> {
  const sticker = await prisma.sticker.findFirst({
    where: { id: stickerId },
    include: { pack: { select: { isActive: true } } },
  });
  if (!sticker) {
    throw new ApiError(404, 'Sticker not found', true, { code: 'sticker.notFound' });
  }
  return {
    ...mapSticker(sticker),
    isActive: sticker.isActive,
    packActive: sticker.pack.isActive,
  };
}

/** Load active sticker for message create; throws if missing/inactive. */
export async function assertSendableSticker(stickerId: string): Promise<{
  id: string;
  emoji: string;
}> {
  const sticker = await prisma.sticker.findFirst({
    where: { id: stickerId, isActive: true },
    include: { pack: { select: { isActive: true } } },
  });
  if (!sticker || !sticker.pack.isActive) {
    throw new ApiError(400, 'Sticker not available', true, { code: 'sticker.unavailable' });
  }
  return { id: sticker.id, emoji: sticker.emoji };
}

export async function bumpStickerRecent(userId: string, stickerId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sticker-recent:${userId}`}))`;
    const prefs = await tx.userStickerPrefs.findUnique({ where: { userId } });
    const recent = [stickerId, ...(prefs?.recent ?? []).filter((id) => id !== stickerId)].slice(
      0,
      MAX_STICKER_RECENT
    );
    await tx.userStickerPrefs.upsert({
      where: { userId },
      create: { userId, recent, favorites: [] },
      update: { recent },
    });
  });
}

export async function getUserStickerPrefs(userId: string): Promise<{
  favorites: string[];
  recent: string[];
}> {
  const prefs = await prisma.userStickerPrefs.findUnique({ where: { userId } });
  return {
    favorites: prefs?.favorites ?? [],
    recent: prefs?.recent ?? [],
  };
}

export async function putUserStickerPrefs(
  userId: string,
  body: { favorites?: string[]; recent?: string[] }
): Promise<{ favorites: string[]; recent: string[] }> {
  const favorites = Array.isArray(body.favorites)
    ? [...new Set(body.favorites.filter((id) => typeof id === 'string' && id.length > 0))].slice(
        0,
        MAX_STICKER_FAVORITES
      )
    : undefined;
  const recent = Array.isArray(body.recent)
    ? [...new Set(body.recent.filter((id) => typeof id === 'string' && id.length > 0))].slice(
        0,
        MAX_STICKER_RECENT
      )
    : undefined;

  const existing = await prisma.userStickerPrefs.findUnique({ where: { userId } });
  const next = await prisma.userStickerPrefs.upsert({
    where: { userId },
    create: {
      userId,
      favorites: favorites ?? existing?.favorites ?? [],
      recent: recent ?? existing?.recent ?? [],
    },
    update: {
      ...(favorites !== undefined ? { favorites } : {}),
      ...(recent !== undefined ? { recent } : {}),
    },
  });
  return { favorites: next.favorites, recent: next.recent };
}
