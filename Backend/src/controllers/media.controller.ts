import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { ImageProcessor } from '../utils/imageProcessor';
import { VideoProcessor } from '../utils/videoProcessor';
import {
  userAvatarTinyUrlFromStandard,
  isOurCircularAvatarUrl,
  isOurAvatarOriginalUrl,
} from '../utils/userAvatarTiny';
import {
  ANIMATED_AVATAR_MAX_UPLOAD_BYTES,
  AVATAR_FRAMES_MAX,
  AVATAR_FRAMES_MAX_TOTAL_BYTES,
  AnimatedAvatarError,
  RenderedAnimatedAvatar,
  assembleAnimatedAvatarFromFrames,
  inspectAnimatedAvatarSource,
  parseAnimatedAvatarCrop,
  parseAvatarFramesFps,
  renderAnimatedAvatar,
} from '../utils/animatedAvatar';
import prisma from '../config/database';
import { MessageService } from '../services/chat/message.service';
import { GameChatViewerAccessService } from '../services/chat/gameChatViewerAccess.service';
import { GroupChannelService } from '../services/chat/groupChannel.service';
import { UserTeamService } from '../services/userTeam.service';
import { parseClubPhotosJson } from '../utils/clubPhotosJson';
import * as clubReviewService from '../services/clubReview.service';
import { isStickerCatalogUrl } from '../services/stickers';
import { Prisma } from '@prisma/client';

const MAX_CLUB_PHOTOS = 24;

/** Per file; most avatar routes send `avatar` + `original`; club admin sends `original` only. */
const MULTIPART_IMAGE_FILE_MAX_BYTES = 32 * 1024 * 1024;

const storage = multer.memoryStorage();

const fileFilter = (req: any, file: any, cb: FileFilterCallback) => {
  const allowedImageTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
  ];
  const allowedDocTypes = [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  const allowedDocExt = new Set(['.pdf', '.txt', '.doc', '.docx']);

  if ((file.fieldname === 'image' || file.fieldname === 'avatar' || file.fieldname === 'original') && allowedImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else if (file.fieldname === 'document') {
    const mimeOk = allowedDocTypes.includes(file.mimetype);
    const ext = path.extname(file.originalname || '').toLowerCase();
    const extOk = allowedDocExt.has(ext);
    if (mimeOk || extOk) {
      cb(null, true);
    } else {
      cb(new ApiError(400, `Invalid file type for field: ${file.fieldname}, mimetype: ${file.mimetype}`));
    }
  } else {
    cb(new ApiError(400, `Invalid file type for field: ${file.fieldname}, mimetype: ${file.mimetype}`));
  }
};

const CHAT_AUDIO_MIMES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
];

const audioFileFilter = (req: any, file: any, cb: FileFilterCallback) => {
  if (file.fieldname === 'audio' && CHAT_AUDIO_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, `Invalid audio file: ${file.mimetype}`));
  }
};

export const uploadChatAudioMulter = multer({
  storage: storage,
  fileFilter: audioFileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

const CHAT_VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/x-m4v'];

const videoFileFilter = (req: any, file: any, cb: FileFilterCallback) => {
  if (file.fieldname === 'video' && CHAT_VIDEO_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else if (file.fieldname === 'poster') {
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedImageTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, `Invalid poster file: ${file.mimetype}`));
    }
  } else {
    cb(new ApiError(400, `Invalid video upload field: ${file.fieldname}`));
  }
};

export const uploadChatVideoMulter = multer({
  storage: storage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MULTIPART_IMAGE_FILE_MAX_BYTES,
  },
});

export const uploadAvatarFiles = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MULTIPART_IMAGE_FILE_MAX_BYTES,
  },
}).fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'original', maxCount: 1 }
]);

const ANIMATED_AVATAR_MIMES = ['image/gif', 'image/webp'];

/** Premium animated avatar: one raw GIF/WebP plus a square crop in source pixels. */
export const uploadAnimatedAvatarFile = multer({
  storage: storage,
  fileFilter: (req: any, file: any, cb: FileFilterCallback) => {
    if (file.fieldname === 'animated' && ANIMATED_AVATAR_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ApiError(400, `Invalid animated avatar file: ${file.mimetype}`));
    }
  },
  limits: { fileSize: ANIMATED_AVATAR_MAX_UPLOAD_BYTES, files: 1 },
}).single('animated');

/** Premium video avatar: frames cut client-side from a trimmed video (never the raw video). */
export const uploadAvatarFramesFiles = multer({
  storage: storage,
  fileFilter: (req: any, file: any, cb: FileFilterCallback) => {
    if (file.fieldname === 'frames' && (file.mimetype === 'image/jpeg' || file.mimetype === 'image/webp')) {
      cb(null, true);
    } else {
      cb(new ApiError(400, `Invalid avatar frame: ${file.mimetype}`));
    }
  },
  limits: { fileSize: AVATAR_FRAMES_MAX_TOTAL_BYTES, files: AVATAR_FRAMES_MAX },
}).array('frames', AVATAR_FRAMES_MAX);

type AvatarEntityType = 'user' | 'game' | 'groupChannel' | 'userTeam' | 'club';

interface AvatarEntity {
  avatar: string | null;
  originalAvatar: string | null;
}

type AvatarSourceFile = Pick<Express.Multer.File, 'buffer' | 'originalname'>;

type AvatarUploadResult = {
  avatarPath: string;
  avatarAnimatedPath?: string | null;
  originalPath: string;
  avatarSize: { width: number; height: number };
  originalSize: { width: number; height: number };
};

function requireAvatarFiles(req: AuthRequest): { avatarFile: Express.Multer.File; originalFile: Express.Multer.File } {
  const bucket = req.files as Record<string, Express.Multer.File[] | Express.Multer.File> | undefined;
  if (!bucket) {
    throw new ApiError(400, 'Both avatar and original image files are required');
  }
  const av = bucket.avatar;
  const orig = bucket.original;
  const avatarFile = Array.isArray(av) ? av[0] : av;
  const originalFile = Array.isArray(orig) ? orig[0] : orig;
  if (!avatarFile || !originalFile) {
    throw new ApiError(400, 'Both avatar and original image files are required');
  }
  return { avatarFile, originalFile };
}

function requireAuthUserId(req: AuthRequest): string {
  if (!req.userId) {
    throw new ApiError(401, 'Unauthorized');
  }
  return req.userId;
}

function sendAvatarUploadJson(res: Response, result: AvatarUploadResult, message: string) {
  res.status(200).json({
    success: true,
    message,
    data: {
      avatarUrl: result.avatarPath,
      originalAvatarUrl: result.originalPath,
      avatarSize: result.avatarSize,
      originalSize: result.originalSize,
      ...(result.avatarAnimatedPath !== undefined && { avatarAnimatedUrl: result.avatarAnimatedPath }),
    },
  });
}

async function uploadAvatarForEntity(
  entityType: AvatarEntityType,
  entityId: string,
  originalFile: AvatarSourceFile,
  avatarFile?: AvatarSourceFile,
  /** User only: the new animated avatar URL; a still upload passes nothing and clears it. */
  avatarAnimated: string | null = null
): Promise<AvatarUploadResult> {
  let entity: AvatarEntity | null = null;
  let previousAnimated: string | null = null;

  switch (entityType) {
    case 'user': {
      const user = await prisma.user.findUnique({
        where: { id: entityId },
        select: { avatar: true, originalAvatar: true, avatarAnimated: true }
      });
      entity = user;
      previousAnimated = user?.avatarAnimated ?? null;
      break;
    }
    case 'game':
      entity = await prisma.game.findUnique({
        where: { id: entityId },
        select: { avatar: true, originalAvatar: true }
      });
      break;
    case 'groupChannel':
      const groupChannel = await prisma.groupChannel.findUnique({
        where: { id: entityId },
        select: { avatar: true, originalAvatar: true }
      });
      entity = groupChannel;
      break;
    case 'userTeam':
      entity = await prisma.userTeam.findUnique({
        where: { id: entityId },
        select: { avatar: true, originalAvatar: true },
      });
      break;
    case 'club':
      entity = await prisma.club.findUnique({
        where: { id: entityId },
        select: { avatar: true, originalAvatar: true },
      });
      break;
  }

  if (!entity) {
    throw new ApiError(404, `${entityType} not found`);
  }

  // Upload + persist first, then delete previous objects. Deleting first leaves a
  // dead DB URL (broken <img>) if processAvatar / DB update fails mid-replace.
  const previousAvatar = entity.avatar;
  const previousOriginal = entity.originalAvatar;

  const result = avatarFile
    ? await ImageProcessor.processAvatar(
        avatarFile.buffer,
        avatarFile.originalname,
        originalFile.buffer,
        originalFile.originalname,
        { userTiny: entityType === 'user' }
      )
    : await ImageProcessor.processAvatar(originalFile.buffer, originalFile.originalname, {
        userTiny: entityType === 'user',
      });

  if (!result.avatarPath || !result.avatarSize) {
    throw new ApiError(500, 'Failed to process avatar');
  }

  switch (entityType) {
    case 'user':
      await prisma.user.update({
        where: { id: entityId },
        data: { avatar: result.avatarPath, originalAvatar: result.originalPath, avatarAnimated }
      });
      break;
    case 'game':
      await prisma.game.update({
        where: { id: entityId },
        data: { avatar: result.avatarPath, originalAvatar: result.originalPath }
      });
      break;
    case 'groupChannel':
      await prisma.groupChannel.update({
        where: { id: entityId },
        data: { 
          avatar: result.avatarPath, 
          originalAvatar: result.originalPath 
        }
      });
      break;
    case 'userTeam':
      await prisma.userTeam.update({
        where: { id: entityId },
        data: {
          avatar: result.avatarPath,
          originalAvatar: result.originalPath,
        },
      });
      break;
    case 'club':
      await prisma.club.update({
        where: { id: entityId },
        data: {
          avatar: result.avatarPath,
          originalAvatar: result.originalPath,
        },
      });
      break;
  }

  if (previousAvatar && isOurCircularAvatarUrl(previousAvatar) && previousAvatar !== result.avatarPath) {
    if (entityType === 'user') {
      const tiny = userAvatarTinyUrlFromStandard(previousAvatar);
      if (tiny) await ImageProcessor.deleteFile(tiny);
    }
    await ImageProcessor.deleteFile(previousAvatar);
  }
  if (
    previousOriginal &&
    isOurAvatarOriginalUrl(previousOriginal) &&
    previousOriginal !== result.originalPath
  ) {
    await ImageProcessor.deleteFile(previousOriginal);
  }
  if (previousAnimated && previousAnimated !== avatarAnimated) {
    await ImageProcessor.deleteAnimatedAvatar(previousAnimated);
  }

  return {
    avatarPath: result.avatarPath,
    ...(entityType === 'user' && { avatarAnimatedPath: avatarAnimated }),
    originalPath: result.originalPath,
    avatarSize: result.avatarSize,
    originalSize: result.originalSize
  };
}

export const uploadAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = requireAuthUserId(req);
  const { avatarFile, originalFile } = requireAvatarFiles(req);
  const result = await uploadAvatarForEntity('user', userId, originalFile, avatarFile);
  sendAvatarUploadJson(res, result, 'Avatar uploaded successfully');
});

async function requirePremiumUploader(req: AuthRequest): Promise<string> {
  const userId = requireAuthUserId(req);
  const me = await prisma.user.findUnique({ where: { id: userId }, select: { isPremium: true } });
  if (!me?.isPremium) {
    throw new ApiError(403, 'Animated avatars are a Premium feature', true, {
      code: 'media.animatedAvatarPremiumOnly',
    });
  }
  return userId;
}

async function renderOrBadRequest(render: () => Promise<RenderedAnimatedAvatar>): Promise<RenderedAnimatedAvatar> {
  try {
    return await render();
  } catch (error) {
    if (error instanceof AnimatedAvatarError) {
      throw new ApiError(400, error.message, true, { code: `media.animatedAvatar.${error.code}` });
    }
    throw error;
  }
}

/** Shared tail of the GIF and video routes: store the WebP, run the still pipeline, swap rows. */
async function storeAnimatedUserAvatar(userId: string, rendered: RenderedAnimatedAvatar): Promise<AvatarUploadResult> {
  const animatedUrl = await ImageProcessor.uploadAnimatedAvatar(rendered.animatedWebp, rendered.animatedTinyWebp);
  try {
    return await uploadAvatarForEntity(
      'user',
      userId,
      { buffer: rendered.stillOriginal, originalname: 'animated-still.jpg' },
      { buffer: rendered.stillCrop, originalname: 'animated-still.jpg' },
      animatedUrl
    );
  } catch (error) {
    await ImageProcessor.deleteAnimatedAvatar(animatedUrl);
    throw error;
  }
}

export const uploadAnimatedAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = await requirePremiumUploader(req);
  const file = req.file;
  if (!file) {
    throw new ApiError(400, 'Animated image file is required');
  }
  const rendered = await renderOrBadRequest(async () => {
    const info = await inspectAnimatedAvatarSource(file.buffer);
    const crop = parseAnimatedAvatarCrop({ x: req.body?.x, y: req.body?.y, size: req.body?.size }, info);
    return renderAnimatedAvatar(file.buffer, info, crop);
  });
  const result = await storeAnimatedUserAvatar(userId, rendered);
  sendAvatarUploadJson(res, result, 'Animated avatar uploaded successfully');
});

export const uploadAvatarFrames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = await requirePremiumUploader(req);
  const files = Array.isArray(req.files) ? req.files : [];
  const rendered = await renderOrBadRequest(async () => {
    const fps = parseAvatarFramesFps(req.body?.fps);
    return assembleAnimatedAvatarFromFrames(files.map((f) => f.buffer), fps);
  });
  const result = await storeAnimatedUserAvatar(userId, rendered);
  sendAvatarUploadJson(res, result, 'Animated avatar uploaded successfully');
});

export const uploadGameAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  requireAuthUserId(req);
  const { gameId } = req.body;
  if (!gameId) {
    throw new ApiError(400, 'Game ID is required');
  }

  const { avatarFile, originalFile } = requireAvatarFiles(req);
  const result = await uploadAvatarForEntity('game', gameId, originalFile, avatarFile);
  sendAvatarUploadJson(res, result, 'Game avatar uploaded successfully');
});

export const uploadGroupChannelAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = requireAuthUserId(req);

  const { groupChannelId } = req.body;
  if (!groupChannelId) {
    throw new ApiError(400, 'Group channel ID is required');
  }

  const groupChannel = await prisma.groupChannel.findUnique({
    where: { id: groupChannelId },
    select: { isCityGroup: true }
  });
  if (!groupChannel) {
    throw new ApiError(404, 'Group/Channel not found');
  }
  const canUpload = groupChannel.isCityGroup && req.user?.isAdmin
    ? true
    : await GroupChannelService.isGroupChannelAdminOrOwner(groupChannelId, userId);
  if (!canUpload) {
    throw new ApiError(403, 'Only owner or admin can upload group/channel avatar');
  }

  const { avatarFile, originalFile } = requireAvatarFiles(req);
  const result = await uploadAvatarForEntity('groupChannel', groupChannelId, originalFile, avatarFile);
  sendAvatarUploadJson(res, result, 'Group/Channel avatar uploaded successfully');
});

export const uploadUserTeamAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = requireAuthUserId(req);
  const { userTeamId } = req.body;
  if (!userTeamId) {
    throw new ApiError(400, 'User team ID is required');
  }

  const team = await prisma.userTeam.findUnique({
    where: { id: userTeamId },
    select: { ownerId: true },
  });
  if (!team) {
    throw new ApiError(404, 'User team not found');
  }
  if (team.ownerId !== userId) {
    throw new ApiError(403, 'Only team owner can upload team avatar');
  }

  const { avatarFile, originalFile } = requireAvatarFiles(req);
  const result = await uploadAvatarForEntity('userTeam', userTeamId, originalFile, avatarFile);
  await UserTeamService.emitUpdatedTeam(userTeamId);
  sendAvatarUploadJson(res, result, 'User team avatar uploaded successfully');
});

export const uploadClubAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { clubId } = req.body;
  if (!clubId || typeof clubId !== 'string') {
    throw new ApiError(400, 'Club ID is required');
  }
  if (!req.user?.isAdmin) {
    const { ClubAdminService } = await import('../services/clubAdmin/clubAdmin.service');
    await ClubAdminService.assertClubCapability(req.userId!, clubId, 'club.edit');
  }
  if (!req.file) {
    throw new ApiError(400, 'Original image file is required');
  }
  const result = await uploadAvatarForEntity('club', clubId, req.file);
  sendAvatarUploadJson(res, result, 'Club avatar uploaded successfully');
});

export const uploadClubPhoto = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No image file provided');
  }
  const { clubId } = req.body;
  if (!clubId || typeof clubId !== 'string') {
    throw new ApiError(400, 'Club ID is required');
  }
  if (!req.user?.isAdmin) {
    const { ClubAdminService } = await import('../services/clubAdmin/clubAdmin.service');
    await ClubAdminService.assertClubCapability(req.userId!, clubId, 'club.edit');
  }
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, photos: true },
  });
  if (!club) {
    throw new ApiError(404, 'Club not found');
  }
  const existing = parseClubPhotosJson(club.photos);
  if (existing.length >= MAX_CLUB_PHOTOS) {
    throw new ApiError(400, `Maximum ${MAX_CLUB_PHOTOS} photos per club`);
  }
  const processed = await ImageProcessor.processChatImage(req.file.buffer, req.file.originalname);
  const next = [
    ...existing,
    { originalUrl: processed.originalPath!, thumbnailUrl: processed.thumbnailPath! },
  ];
  const updated = await prisma.club.update({
    where: { id: clubId },
    data: { photos: next as Prisma.InputJsonValue },
    include: {
      city: { select: { id: true, name: true } },
      _count: { select: { courts: true } },
    },
  });
  res.status(200).json({
    success: true,
    message: 'Club photo uploaded successfully',
    data: updated,
  });
});

export const uploadClubReviewPhoto = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }
  if (!req.file) {
    throw new ApiError(400, 'No image file provided');
  }
  const { clubId, gameId } = req.body;
  if (!clubId || typeof clubId !== 'string') {
    throw new ApiError(400, 'Club ID is required');
  }
  if (!gameId || typeof gameId !== 'string') {
    throw new ApiError(400, 'Game ID is required');
  }
  await clubReviewService.assertEligibleForClubReview(userId, clubId, gameId);
  const n = await clubReviewService.countReviewPhotosForUserGame(userId, gameId);
  if (n >= clubReviewService.MAX_PHOTOS_PER_CLUB_REVIEW) {
    throw new ApiError(400, `Maximum ${clubReviewService.MAX_PHOTOS_PER_CLUB_REVIEW} photos per review`);
  }
  const processed = await ImageProcessor.processChatImage(req.file.buffer, req.file.originalname);
  res.status(200).json({
    success: true,
    message: 'Club review photo uploaded successfully',
    data: {
      originalUrl: processed.originalPath!,
      thumbnailUrl: processed.thumbnailPath!,
      originalSize: processed.originalSize,
      thumbnailSize: processed.thumbnailSize,
    },
  });
});

export const uploadChatAudio = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No audio file provided');
  }

  const { gameId, bugId, userChatId, groupChannelId } = req.body;
  const senderId = req.userId;

  if (!senderId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!gameId && !bugId && !userChatId && !groupChannelId) {
    throw new ApiError(400, 'At least one of gameId, bugId, userChatId, or groupChannelId is required');
  }

  if (gameId) {
    await GameChatViewerAccessService.assertWritable(gameId, senderId);
  } else if (bugId) {
    await MessageService.validateBugAccess(bugId, senderId, true);
  } else if (userChatId) {
    await MessageService.validateUserChatAccess(userChatId, senderId, true);
  } else if (groupChannelId) {
    await MessageService.validateGroupChannelAccess(groupChannelId, senderId, true);
  }

  const result = await ImageProcessor.processChatAudio(req.file.buffer, req.file.originalname, req.file.mimetype);

  res.status(200).json({
    success: true,
    message: 'Chat audio uploaded successfully',
    data: {
      audioUrl: result.audioUrl,
    },
  });
});

export const uploadChatVideo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const bucket = req.files as Record<string, Express.Multer.File[]> | undefined;
  const videoFile = bucket?.video?.[0];
  if (!videoFile) {
    throw new ApiError(400, 'No video file provided');
  }

  const { gameId, bugId, userChatId, groupChannelId, durationMs, width, height } = req.body;
  const posterFile = bucket?.poster?.[0];
  const senderId = req.userId;

  if (!senderId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!gameId && !bugId && !userChatId && !groupChannelId) {
    throw new ApiError(400, 'At least one of gameId, bugId, userChatId, or groupChannelId is required');
  }

  if (gameId) {
    await GameChatViewerAccessService.assertWritable(gameId, senderId);
  } else if (bugId) {
    await MessageService.validateBugAccess(bugId, senderId, true);
  } else if (userChatId) {
    await MessageService.validateUserChatAccess(userChatId, senderId, true);
  } else if (groupChannelId) {
    await MessageService.validateGroupChannelAccess(groupChannelId, senderId, true);
  }

  const parsedDuration = durationMs != null && durationMs !== '' ? Number(durationMs) : undefined;
  const parsedWidth = width != null && width !== '' ? Number(width) : undefined;
  const parsedHeight = height != null && height !== '' ? Number(height) : undefined;

  const result = await VideoProcessor.processChatVideo(
    videoFile.buffer,
    videoFile.originalname,
    posterFile?.buffer,
    {
      durationMs: parsedDuration !== undefined && !Number.isNaN(parsedDuration) ? parsedDuration : undefined,
      width: parsedWidth !== undefined && !Number.isNaN(parsedWidth) ? parsedWidth : undefined,
      height: parsedHeight !== undefined && !Number.isNaN(parsedHeight) ? parsedHeight : undefined,
    }
  );

  res.status(200).json({
    success: true,
    message: 'Chat video uploaded successfully',
    data: result,
  });
});

export const uploadChatImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No image file provided');
  }

  const { gameId, bugId, userChatId, groupChannelId } = req.body;
  const senderId = req.userId;

  if (!senderId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!gameId && !bugId && !userChatId && !groupChannelId) {
    throw new ApiError(400, 'At least one of gameId, bugId, userChatId, or groupChannelId is required');
  }

  // Validate access based on context type
  if (gameId) {
    await GameChatViewerAccessService.assertWritable(gameId, senderId);
  } else if (bugId) {
    await MessageService.validateBugAccess(bugId, senderId, true);
  } else if (userChatId) {
    await MessageService.validateUserChatAccess(userChatId, senderId, true);
  } else if (groupChannelId) {
    await MessageService.validateGroupChannelAccess(groupChannelId, senderId, true);
  }

  // Process chat image
  const result = await ImageProcessor.processChatImage(req.file.buffer, req.file.originalname);

  res.status(200).json({
    success: true,
    message: 'Chat image uploaded successfully',
    data: {
      originalUrl: result.originalPath,
      thumbnailUrl: result.thumbnailPath,
      originalSize: result.originalSize,
      thumbnailSize: result.thumbnailSize
    }
  });
});

export const uploadChatDocument = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No document file provided');
  }

  const { gameId, bugId, userChatId, groupChannelId } = req.body;
  const senderId = req.userId;

  if (!senderId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!gameId && !bugId && !userChatId && !groupChannelId) {
    throw new ApiError(400, 'At least one of gameId, bugId, userChatId, or groupChannelId is required');
  }

  if (gameId) {
    await GameChatViewerAccessService.assertWritable(gameId, senderId);
  } else if (bugId) {
    await MessageService.validateBugAccess(bugId, senderId, true);
  } else if (userChatId) {
    await MessageService.validateUserChatAccess(userChatId, senderId, true);
  } else if (groupChannelId) {
    await MessageService.validateGroupChannelAccess(groupChannelId, senderId, true);
  }

  const result = await ImageProcessor.processDocument(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype
  );

  res.status(200).json({
    success: true,
    message: 'Document uploaded successfully',
    data: {
      fileUrl: result.filePath,
      thumbnailUrl: result.thumbnailPath,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    },
  });
});

export const uploadMarketItemImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No image file provided');
  }
  if (!req.userId) {
    throw new ApiError(401, 'Unauthorized');
  }
  const result = await ImageProcessor.processChatImage(req.file.buffer, req.file.originalname);
  res.status(200).json({
    success: true,
    message: 'Image uploaded successfully',
    data: {
      originalUrl: result.originalPath,
      thumbnailUrl: result.thumbnailPath,
      originalSize: result.originalSize,
      thumbnailSize: result.thumbnailSize
    }
  });
});

export const uploadGameMedia = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No media file provided');
  }

  const { gameId } = req.body;

  // Process game media
  const result = await ImageProcessor.processGameMedia(req.file.buffer, req.file.originalname);

  // Update game with media URLs
  await prisma.game.update({
    where: { id: gameId },
    data: {
      mediaUrls: {
        push: result.originalPath
      }
    }
  });

  res.status(200).json({
    success: true,
    message: 'Game media uploaded successfully',
    data: {
      originalUrl: result.originalPath,
      thumbnailUrl: result.thumbnailPath,
      originalSize: result.originalSize,
      thumbnailSize: result.thumbnailSize
    }
  });
});

export const deleteFile = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { filePath } = req.body;
  
  if (!filePath) {
    throw new ApiError(400, 'File path is required');
  }

  if (isStickerCatalogUrl(String(filePath))) {
    throw new ApiError(403, 'Sticker catalog assets cannot be deleted via this endpoint', true, {
      code: 'media.stickerCatalogProtected',
    });
  }

  const deleted = await ImageProcessor.deleteFile(filePath);
  
  if (!deleted) {
    throw new ApiError(404, 'File not found or could not be deleted');
  }
  
  res.status(200).json({
    success: true,
    message: 'File deleted successfully'
  });
});
