import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { GamePhotoCreateService } from '../services/gamePhoto/gamePhoto.create.service';
import { GamePhotoReadService } from '../services/gamePhoto/gamePhoto.read.service';
import { GamePhotoUpdateService } from '../services/gamePhoto/gamePhoto.update.service';
import { GamePhotoDeleteService } from '../services/gamePhoto/gamePhoto.delete.service';
import { MAX_GAME_PHOTO_FILE_BYTES } from '../services/gamePhoto/gamePhoto.constants';

export const uploadGamePhoto = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No image file provided');
  }
  if (req.file.size > MAX_GAME_PHOTO_FILE_BYTES) {
    throw new ApiError(400, 'Image file too large');
  }

  const { gameId } = req.params;
  const userId = req.userId!;
  const clientUploadId =
    typeof req.body.clientUploadId === 'string' ? req.body.clientUploadId : undefined;

  const photo = await GamePhotoCreateService.uploadGamePhoto(
    gameId,
    userId,
    req.user?.isAdmin ?? false,
    req.file,
    clientUploadId
  );

  res.status(201).json({ success: true, data: photo });
});

export const listGamePhotos = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const userId = req.userId!;
  const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;

  const result = await GamePhotoReadService.listGamePhotos(
    gameId,
    userId,
    req.user?.isAdmin ?? false,
    { limit: Number.isFinite(limit) ? limit : undefined, cursor }
  );

  res.json({ success: true, data: result });
});

export const setMainGamePhoto = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const userId = req.userId!;
  const photoId = req.body.photoId === null || req.body.photoId === '' ? null : String(req.body.photoId);

  const result = await GamePhotoUpdateService.setMainPhoto(
    gameId,
    userId,
    req.user?.isAdmin ?? false,
    photoId
  );

  res.json({ success: true, data: result });
});

export const deleteGamePhoto = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, photoId } = req.params;
  const userId = req.userId!;

  const result = await GamePhotoDeleteService.deleteGamePhoto(
    gameId,
    photoId,
    userId,
    req.user?.isAdmin ?? false
  );

  res.json({ success: true, data: result });
});
