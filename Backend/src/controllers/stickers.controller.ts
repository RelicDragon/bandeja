import { Response } from 'express';
import { Sport } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import {
  listStickerPacks,
  getStickerPackById,
  getStickerById,
  getUserStickerPrefs,
  putUserStickerPrefs,
  bumpUserChatMediaRecent,
  normalizeChatMediaRecentItem,
  savePersonalStickerFromMessage,
  deactivatePersonalSticker,
} from '../services/stickers';

const SPORTS = new Set<string>(Object.values(Sport));

export const listPacks = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
  const sportRaw = typeof req.query.sport === 'string' ? req.query.sport.trim().toUpperCase() : '';
  const sport =
    sportRaw && SPORTS.has(sportRaw) ? (sportRaw as Sport) : undefined;
  const packs = await listStickerPacks({ userId, sport: sport ?? null });
  res.json({ success: true, data: { packs } });
});

export const getPack = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
  const { packId } = req.params;
  if (!packId) throw new ApiError(400, 'packId is required');
  const result = await getStickerPackById(packId, userId);
  res.json({ success: true, data: result });
});

export const getSticker = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { stickerId } = req.params;
  if (!stickerId) throw new ApiError(400, 'stickerId is required');
  const sticker = await getStickerById(stickerId);
  res.json({ success: true, data: { sticker } });
});

export const getMyPrefs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
  const prefs = await getUserStickerPrefs(userId);
  res.json({ success: true, data: prefs });
});

export const putMyPrefs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
  const prefs = await putUserStickerPrefs(userId, {
    favorites: req.body?.favorites,
    recentMedia: req.body?.recentMedia,
  });
  res.json({ success: true, data: prefs });
});

export const bumpMyRecent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
  const item = normalizeChatMediaRecentItem(req.body?.item);
  if (!item || item.kind !== 'GIF') {
    throw new ApiError(400, 'Valid GIF recent item is required', true, {
      code: 'sticker.invalidRecentMedia',
    });
  }
  const prefs = await bumpUserChatMediaRecent(userId, item);
  res.json({ success: true, data: prefs });
});

export const saveFromMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
  const messageId = typeof req.body?.messageId === 'string' ? req.body.messageId : '';
  const mediaIndexRaw = req.body?.mediaIndex;
  const mediaIndex =
    typeof mediaIndexRaw === 'number' && Number.isFinite(mediaIndexRaw)
      ? Math.max(0, Math.floor(mediaIndexRaw))
      : undefined;
  const sticker = await savePersonalStickerFromMessage(userId, { messageId, mediaIndex });
  res.json({ success: true, data: { sticker } });
});

export const deactivateMine = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized', true, { code: 'auth.notAuthenticated' });
  const { stickerId } = req.params;
  if (!stickerId) throw new ApiError(400, 'stickerId is required');
  await deactivatePersonalSticker(userId, stickerId);
  res.json({ success: true, data: { ok: true } });
});
