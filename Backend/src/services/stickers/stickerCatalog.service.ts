import prisma from '../../config/database';
import type { Prisma, Sport } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import {
  bumpRecentMedia,
  normalizeFavoritesInput,
  normalizeRecentMediaInput,
  type ChatMediaRecent,
} from './stickerPrefsNormalize';
import { sortStickerPacksForSport } from './stickerPackSort';
import { isPersonalStickerSendableBy, isStickerPackVisibleToUser } from './stickerPackAccess';

export type StickerPackListItem = {
  id: string;
  slug: string;
  title: string;
  sport: Sport | null;
  locale: string | null;
  isOfficial: boolean;
  ownerUserId: string | null;
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

/** Bust CDN/browser cache when seed rewrites the same S3 key. */
function withAssetVersion(url: string | null | undefined, contentHash: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const hash = contentHash?.trim();
  if (!hash) return url.trim();
  const base = url.trim();
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=${hash.slice(0, 16)}`;
}

export function mapStickerDto(s: {
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
  contentHash?: string | null;
}): StickerDto {
  return {
    id: s.id,
    packId: s.packId,
    slug: s.slug,
    emoji: s.emoji,
    title: s.title,
    staticUrl: withAssetVersion(s.staticUrl, s.contentHash) ?? s.staticUrl,
    animatedUrl: withAssetVersion(s.animatedUrl, s.contentHash),
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
  ownerUserId: string | null;
  sortOrder: number;
  coverSticker: {
    id: string;
    slug: string;
    emoji: string;
    staticUrl: string;
    animatedUrl: string | null;
    width: number;
    height: number;
    contentHash?: string | null;
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
    ownerUserId: p.ownerUserId,
    sortOrder: p.sortOrder,
    stickerCount: p._count.stickers,
    coverSticker: p.coverSticker
      ? {
          id: p.coverSticker.id,
          slug: p.coverSticker.slug,
          emoji: p.coverSticker.emoji,
          staticUrl: withAssetVersion(p.coverSticker.staticUrl, p.coverSticker.contentHash) ?? p.coverSticker.staticUrl,
          animatedUrl: withAssetVersion(p.coverSticker.animatedUrl, p.coverSticker.contentHash),
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
      contentHash: true,
    },
  },
  _count: { select: { stickers: { where: { isActive: true } } } },
} as const;

function assertPackVisibleToUser(
  pack: { isOfficial: boolean; ownerUserId: string | null },
  userId: string | undefined
): void {
  if (isStickerPackVisibleToUser(pack, userId)) return;
  throw new ApiError(404, 'Sticker pack not found', true, { code: 'sticker.packNotFound' });
}

export async function listStickerPacks(opts?: {
  userId?: string;
  sport?: Sport | null;
}): Promise<StickerPackListItem[]> {
  const userId = opts?.userId;
  const packs = await prisma.stickerPack.findMany({
    where: userId
      ? {
          isActive: true,
          OR: [{ isOfficial: true, ownerUserId: null }, { ownerUserId: userId }],
        }
      : { isActive: true, isOfficial: true, ownerUserId: null },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    include: packInclude,
  });

  const sorted = sortStickerPacksForSport(packs, opts?.sport ?? null);
  return sorted.map((p) => mapPackListItem(p));
}

export async function getStickerPackById(
  packId: string,
  userId?: string
): Promise<{
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
  assertPackVisibleToUser(pack, userId);

  return {
    pack: mapPackListItem(pack),
    stickers: pack.stickers.map(mapStickerDto),
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
    ...mapStickerDto(sticker),
    isActive: sticker.isActive,
    packActive: sticker.pack.isActive,
  };
}

/**
 * Load active sticker for message create.
 * Official packs: any sender. Personal packs: owner only.
 */
export async function assertSendableSticker(
  stickerId: string,
  senderUserId: string
): Promise<{
  id: string;
  emoji: string;
}> {
  const sticker = await prisma.sticker.findFirst({
    where: { id: stickerId, isActive: true },
    include: {
      pack: { select: { isActive: true, isOfficial: true, ownerUserId: true } },
    },
  });
  if (!sticker || !sticker.pack.isActive) {
    throw new ApiError(400, 'Sticker not available', true, { code: 'sticker.unavailable' });
  }
  if (!isPersonalStickerSendableBy(sticker.pack, senderUserId)) {
    throw new ApiError(400, 'Sticker not available', true, { code: 'sticker.unavailable' });
  }
  return { id: sticker.id, emoji: sticker.emoji };
}

/**
 * Forward path: sticker must still exist/be active, but personal-pack ownership
 * is not required (message already contained a valid reference).
 */
export async function assertForwardableSticker(stickerId: string): Promise<{
  id: string;
  emoji: string;
}> {
  const sticker = await prisma.sticker.findFirst({
    where: { id: stickerId, isActive: true },
    include: {
      pack: { select: { isActive: true } },
    },
  });
  if (!sticker || !sticker.pack.isActive) {
    throw new ApiError(400, 'Sticker not available', true, { code: 'sticker.unavailable' });
  }
  return { id: sticker.id, emoji: sticker.emoji };
}

export async function bumpStickerRecent(userId: string, stickerId: string): Promise<void> {
  await bumpUserChatMediaRecent(userId, { kind: 'STICKER', stickerId });
}

export async function bumpUserChatMediaRecent(
  userId: string,
  item: ChatMediaRecent
): Promise<{ favorites: string[]; recentMedia: ChatMediaRecent[] }> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sticker-prefs:${userId}`}))`;
    const prefs = await tx.userStickerPrefs.findUnique({ where: { userId } });
    const recentMedia = bumpRecentMedia(prefs?.recentMedia, item);
    const saved = await tx.userStickerPrefs.upsert({
      where: { userId },
      create: { userId, recentMedia, favorites: [] },
      update: { recentMedia },
    });
    return {
      favorites: saved.favorites,
      recentMedia: normalizeRecentMediaInput(saved.recentMedia) ?? [],
    };
  });
}

export async function getUserStickerPrefs(userId: string): Promise<{
  favorites: string[];
  recentMedia: ChatMediaRecent[];
}> {
  const prefs = await prisma.userStickerPrefs.findUnique({ where: { userId } });
  return {
    favorites: prefs?.favorites ?? [],
    recentMedia: normalizeRecentMediaInput(prefs?.recentMedia) ?? [],
  };
}

export async function putUserStickerPrefs(
  userId: string,
  body: { favorites?: string[]; recentMedia?: unknown }
): Promise<{ favorites: string[]; recentMedia: ChatMediaRecent[] }> {
  const favorites = normalizeFavoritesInput(body.favorites);
  const recentMedia = normalizeRecentMediaInput(body.recentMedia);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sticker-prefs:${userId}`}))`;
    const existing = await tx.userStickerPrefs.findUnique({ where: { userId } });
    const next = await tx.userStickerPrefs.upsert({
      where: { userId },
      create: {
        userId,
        favorites: favorites ?? existing?.favorites ?? [],
        recentMedia: recentMedia ?? existing?.recentMedia ?? [],
      },
      update: {
        ...(favorites !== undefined ? { favorites } : {}),
        ...(recentMedia !== undefined ? { recentMedia } : {}),
      },
    });
    return {
      favorites: next.favorites,
      recentMedia: normalizeRecentMediaInput(next.recentMedia) ?? [],
    };
  });
}
