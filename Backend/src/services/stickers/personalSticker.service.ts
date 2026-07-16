import { MessageType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ImageProcessor } from '../../utils/imageProcessor';
import { S3Service } from '../s3.service';
import {
  MAX_PERSONAL_STICKERS,
  PERSONAL_PACK_TITLE,
  personalPackSlug,
} from './stickerConstants';
import {
  isStickerCatalogUrl,
  publicUrlForKey,
  stickerStaticS3Key,
  uploadStickerWebpAtKey,
} from './stickerAsset.service';
import {
  normalizePersonalStickerWebp,
  validatePersonalStickerSource,
} from './personalStickerValidate';
import { tryConsumePersonalStickerSaveRateLimit } from './personalSticker.rateLimit';
import { bumpStickerRecent, mapStickerDto, type StickerDto } from './stickerCatalog.service';

const CHAT_MEDIA_KEY_PREFIX = 'uploads/chat/';

/**
 * Personal sticker storage rules:
 * - Assets live under `uploads/stickers/packs/personal-{userId}/…` (catalog prefix).
 * - Chat message delete never removes catalog objects (same as official packs).
 * - Soft-deactivating a personal sticker (`isActive=false`) keeps the row + S3 object
 *   so historical `STICKER` messages with Restrict FK still hydrate.
 * - Pack listing is owner-only; GET by sticker id is allowed for recipients to hydrate bubbles.
 */

function assertChatOwnedMediaUrl(url: string): string {
  let key: string;
  try {
    key = S3Service.extractS3Key(url);
  } catch {
    throw new ApiError(400, 'Invalid media URL', true, { code: 'sticker.personal.invalidMedia' });
  }
  if (isStickerCatalogUrl(url) || key.startsWith('uploads/stickers/') || key.startsWith('stickers/')) {
    throw new ApiError(400, 'Already a sticker catalog asset', true, {
      code: 'sticker.personal.alreadyCatalog',
    });
  }
  if (!key.startsWith(CHAT_MEDIA_KEY_PREFIX)) {
    throw new ApiError(400, 'Only chat images can be saved as stickers', true, {
      code: 'sticker.personal.notChatMedia',
    });
  }
  return key;
}

export async function ensurePersonalStickerPack(userId: string): Promise<{
  id: string;
  slug: string;
}> {
  const slug = personalPackSlug(userId);
  const existing = await prisma.stickerPack.findFirst({
    where: { ownerUserId: userId },
    select: { id: true, slug: true },
  });
  if (existing) return existing;

  try {
    return await prisma.stickerPack.create({
      data: {
        slug,
        title: PERSONAL_PACK_TITLE,
        isOfficial: false,
        ownerUserId: userId,
        isActive: true,
        sortOrder: -100,
        sport: null,
      },
      select: { id: true, slug: true },
    });
  } catch (err: unknown) {
    // Unique race: another request created the pack.
    const again = await prisma.stickerPack.findFirst({
      where: { ownerUserId: userId },
      select: { id: true, slug: true },
    });
    if (again) return again;
    throw err;
  }
}

function nextPersonalSlug(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function savePersonalStickerFromMessage(
  userId: string,
  opts: { messageId: string; mediaIndex?: number }
): Promise<StickerDto> {
  const messageId = opts.messageId?.trim();
  if (!messageId) {
    throw new ApiError(400, 'messageId is required', true, { code: 'sticker.personal.messageRequired' });
  }

  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, deletedAt: null },
    select: {
      id: true,
      messageType: true,
      mediaUrls: true,
      chatContextType: true,
      contextId: true,
      chatType: true,
    },
  });
  if (!message) {
    throw new ApiError(404, 'Message not found', true, { code: 'sticker.personal.messageNotFound' });
  }

  // Lazy import avoids circular: message.service → stickers → personal → message.
  const { MessageService } = await import('../chat/message.service');
  await MessageService.validateMessageAccess(message, userId, false);

  if (message.messageType !== MessageType.IMAGE) {
    throw new ApiError(400, 'Only image messages can be saved as stickers', true, {
      code: 'sticker.personal.notImage',
    });
  }

  const mediaIndex = opts.mediaIndex ?? 0;
  const mediaUrl = message.mediaUrls[mediaIndex];
  if (!mediaUrl || typeof mediaUrl !== 'string') {
    throw new ApiError(400, 'Image not found on message', true, {
      code: 'sticker.personal.noMedia',
    });
  }

  assertChatOwnedMediaUrl(mediaUrl);

  let buffer: Buffer;
  try {
    const got = await S3Service.getObjectBuffer(mediaUrl);
    buffer = got.buffer;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, 'Could not load image', true, { code: 'sticker.personal.fetchFailed' });
  }

  await validatePersonalStickerSource(buffer);
  const normalized = await normalizePersonalStickerWebp(buffer);

  const pack = await ensurePersonalStickerPack(userId);

  const [activeCount, existingSame] = await Promise.all([
    prisma.sticker.count({
      where: { packId: pack.id, isActive: true },
    }),
    prisma.sticker.findFirst({
      where: { packId: pack.id, contentHash: normalized.contentHash, isActive: true },
    }),
  ]);

  if (existingSame) {
    await bumpStickerRecent(userId, existingSame.id);
    return mapStickerDto(existingSame);
  }

  if (activeCount >= MAX_PERSONAL_STICKERS) {
    throw new ApiError(400, `Personal sticker limit (${MAX_PERSONAL_STICKERS}) reached`, true, {
      code: 'sticker.personal.packFull',
    });
  }

  // After validate / dedupe / capacity — failed format checks do not burn quota.
  if (!tryConsumePersonalStickerSaveRateLimit(userId)) {
    throw new ApiError(429, 'Too many sticker saves. Try again shortly.', true, {
      code: 'sticker.personal.rateLimited',
    });
  }

  const stickerSlug = nextPersonalSlug();
  const key = stickerStaticS3Key(pack.slug, stickerSlug, normalized.contentHash);
  const staticUrl = await uploadStickerWebpAtKey({
    key,
    imageBuffer: normalized.webp,
  });
  const resolvedUrl = staticUrl || publicUrlForKey(key);

  let createdNewRow = false;
  try {
    const sticker = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`personal-sticker:${userId}`}))`;
      const lockedCount = await tx.sticker.count({
        where: { packId: pack.id, isActive: true },
      });
      if (lockedCount >= MAX_PERSONAL_STICKERS) {
        throw new ApiError(400, `Personal sticker limit (${MAX_PERSONAL_STICKERS}) reached`, true, {
          code: 'sticker.personal.packFull',
        });
      }
      const dup = await tx.sticker.findFirst({
        where: { packId: pack.id, contentHash: normalized.contentHash, isActive: true },
      });
      if (dup) return { row: dup, created: false as const };

      const created = await tx.sticker.create({
        data: {
          packId: pack.id,
          slug: stickerSlug,
          emoji: '⭐',
          title: null,
          staticUrl: resolvedUrl,
          animatedUrl: null,
          width: normalized.width,
          height: normalized.height,
          contentHash: normalized.contentHash,
          sortOrder: lockedCount,
          isActive: true,
        },
      });
      return { row: created, created: true as const };
    });

    createdNewRow = sticker.created;

    if (!sticker.created) {
      try {
        const { ImageProcessor } = await import('../../utils/imageProcessor');
        await ImageProcessor.deleteFile(resolvedUrl);
      } catch {
        /* unused upload for deduped hash */
      }
    }

    const packMeta = await prisma.stickerPack.findUnique({
      where: { id: pack.id },
      select: { coverStickerId: true },
    });
    if (sticker.created && packMeta && !packMeta.coverStickerId) {
      await prisma.stickerPack.update({
        where: { id: pack.id },
        data: { coverStickerId: sticker.row.id },
      });
    }

    await bumpStickerRecent(userId, sticker.row.id);
    return mapStickerDto(sticker.row);
  } catch (err) {
    if (!createdNewRow) {
      try {
        const { ImageProcessor } = await import('../../utils/imageProcessor');
        await ImageProcessor.deleteFile(resolvedUrl);
      } catch {
        /* ignore orphan cleanup failure */
      }
    }
    throw err;
  }
}

export async function deactivatePersonalSticker(
  userId: string,
  stickerId: string
): Promise<void> {
  const sticker = await prisma.sticker.findFirst({
    where: { id: stickerId },
    include: { pack: { select: { ownerUserId: true, coverStickerId: true, id: true } } },
  });
  if (!sticker || sticker.pack.ownerUserId !== userId) {
    throw new ApiError(404, 'Sticker not found', true, { code: 'sticker.notFound' });
  }
  if (!sticker.isActive) return;

  await prisma.sticker.update({
    where: { id: stickerId },
    data: { isActive: false },
  });

  if (sticker.pack.coverStickerId === stickerId) {
    const nextCover = await prisma.sticker.findFirst({
      where: { packId: sticker.pack.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true },
    });
    await prisma.stickerPack.update({
      where: { id: sticker.pack.id },
      data: { coverStickerId: nextCover?.id ?? null },
    });
  }
}

/**
 * Before admin hard-delete of a user: detach ChatMessage.stickerId (Restrict FK)
 * and remove personal pack S3 objects so pack Cascade cannot fail / leave orphans.
 * Keeps denorm `stickerEmoji` on remaining messages if any survive sender cascade.
 */
export async function preparePersonalStickersForUserHardDelete(userId: string): Promise<void> {
  const pack = await prisma.stickerPack.findFirst({
    where: { ownerUserId: userId },
    select: {
      id: true,
      stickers: { select: { id: true, staticUrl: true, animatedUrl: true } },
    },
  });
  if (!pack) return;

  const stickerIds = pack.stickers.map((s) => s.id);
  if (stickerIds.length > 0) {
    await prisma.chatMessage.updateMany({
      where: { stickerId: { in: stickerIds } },
      data: { stickerId: null },
    });
  }

  for (const s of pack.stickers) {
    try {
      await ImageProcessor.deleteFile(s.staticUrl);
    } catch {
      /* best-effort */
    }
    if (s.animatedUrl) {
      try {
        await ImageProcessor.deleteFile(s.animatedUrl);
      } catch {
        /* best-effort */
      }
    }
  }
}
