import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import multer, { FileFilterCallback } from 'multer';
import { ImageProcessor } from '../utils/imageProcessor';
import {
  userAvatarTinyUrlFromStandard,
  isOurCircularAvatarUrl,
  isOurAvatarOriginalUrl,
} from '../utils/userAvatarTiny';
import prisma from '../config/database';
import { hasParentGamePermission } from '../utils/parentGamePermissions';
import { ParticipantRole, Prisma } from '@prisma/client';
import { MessageService } from '../services/chat/message.service';
import { GroupChannelService } from '../services/chat/groupChannel.service';
import { UserTeamService } from '../services/userTeam.service';
import { parseClubPhotosJson } from '../utils/clubPhotosJson';

const MAX_CLUB_PHOTOS = 24;

const storage = multer.memoryStorage();

const fileFilter = (req: any, file: any, cb: FileFilterCallback) => {
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedDocTypes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  
  if ((file.fieldname === 'image' || file.fieldname === 'avatar' || file.fieldname === 'original') && allowedImageTypes.includes(file.mimetype)) {
    cb(null, true);
  } else if (file.fieldname === 'document' && allowedDocTypes.includes(file.mimetype)) {
    cb(null, true);
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

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

export const uploadAvatarFiles = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
}).fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'original', maxCount: 1 }
]);

type AvatarEntityType = 'user' | 'game' | 'groupChannel' | 'userTeam' | 'club';

interface AvatarEntity {
  avatar: string | null;
  originalAvatar: string | null;
}

type AvatarUploadResult = {
  avatarPath: string;
  originalPath: string;
  avatarSize: { width: number; height: number };
  originalSize: { width: number; height: number };
};

function requireAvatarOriginalFile(req: AuthRequest): Express.Multer.File {
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
  return originalFile;
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
    },
  });
}

async function uploadAvatarForEntity(
  entityType: AvatarEntityType,
  entityId: string,
  originalFile: Express.Multer.File
): Promise<AvatarUploadResult> {
  let entity: AvatarEntity | null = null;

  switch (entityType) {
    case 'user':
      entity = await prisma.user.findUnique({
        where: { id: entityId },
        select: { avatar: true, originalAvatar: true }
      });
      break;
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

  if (entity.avatar && isOurCircularAvatarUrl(entity.avatar)) {
    if (entityType === 'user') {
      const tiny = userAvatarTinyUrlFromStandard(entity.avatar);
      if (tiny) await ImageProcessor.deleteFile(tiny);
    }
    await ImageProcessor.deleteFile(entity.avatar);
  }
  if (entity.originalAvatar && isOurAvatarOriginalUrl(entity.originalAvatar)) {
    await ImageProcessor.deleteFile(entity.originalAvatar);
  }

  const result = await ImageProcessor.processAvatar(originalFile.buffer, originalFile.originalname, {
    userTiny: entityType === 'user',
  });

  if (!result.avatarPath || !result.avatarSize) {
    throw new ApiError(500, 'Failed to process avatar');
  }

  switch (entityType) {
    case 'user':
      await prisma.user.update({
        where: { id: entityId },
        data: { avatar: result.avatarPath, originalAvatar: result.originalPath }
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

  return {
    avatarPath: result.avatarPath,
    originalPath: result.originalPath,
    avatarSize: result.avatarSize,
    originalSize: result.originalSize
  };
}

export const uploadAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = requireAuthUserId(req);
  const originalFile = requireAvatarOriginalFile(req);
  const result = await uploadAvatarForEntity('user', userId, originalFile);
  sendAvatarUploadJson(res, result, 'Avatar uploaded successfully');
});

export const uploadGameAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  requireAuthUserId(req);
  const { gameId } = req.body;
  if (!gameId) {
    throw new ApiError(400, 'Game ID is required');
  }

  const originalFile = requireAvatarOriginalFile(req);
  const result = await uploadAvatarForEntity('game', gameId, originalFile);
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

  const originalFile = requireAvatarOriginalFile(req);
  const result = await uploadAvatarForEntity('groupChannel', groupChannelId, originalFile);
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

  const originalFile = requireAvatarOriginalFile(req);
  const result = await uploadAvatarForEntity('userTeam', userTeamId, originalFile);
  await UserTeamService.emitUpdatedTeam(userTeamId);
  sendAvatarUploadJson(res, result, 'User team avatar uploaded successfully');
});

export const uploadClubAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user?.isAdmin) {
    throw new ApiError(403, 'Admin access required');
  }
  const { clubId } = req.body;
  if (!clubId || typeof clubId !== 'string') {
    throw new ApiError(400, 'Club ID is required');
  }
  const originalFile = requireAvatarOriginalFile(req);
  const result = await uploadAvatarForEntity('club', clubId, originalFile);
  sendAvatarUploadJson(res, result, 'Club avatar uploaded successfully');
});

export const uploadClubPhoto = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user?.isAdmin) {
    throw new ApiError(403, 'Admin access required');
  }
  if (!req.file) {
    throw new ApiError(400, 'No image file provided');
  }
  const { clubId } = req.body;
  if (!clubId || typeof clubId !== 'string') {
    throw new ApiError(400, 'Club ID is required');
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
    await MessageService.validateGameAccess(gameId, senderId);
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
    await MessageService.validateGameAccess(gameId, senderId);
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

  const { gameId } = req.body;
  const senderId = req.userId!;

  // Check for pending invite or participant access
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: {
        where: { userId: senderId },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const hasPermission = await hasParentGamePermission(
    gameId,
    senderId,
    [ParticipantRole.OWNER, ParticipantRole.ADMIN, ParticipantRole.PARTICIPANT],
    req.user?.isAdmin || false
  );
  const hasPendingInvite = (game as any).participants?.[0]?.status === 'INVITED';

  if (!hasPermission && !hasPendingInvite) {
    throw new ApiError(403, 'You are not a participant or invited to this game');
  }

  // Process document
  const result = await ImageProcessor.processDocument(req.file.buffer, req.file.originalname, req.file.mimetype);

  res.status(200).json({
    success: true,
    message: 'Document uploaded successfully',
    data: {
      fileUrl: result.filePath,
      thumbnailUrl: result.thumbnailPath,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    }
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

  const deleted = await ImageProcessor.deleteFile(filePath);
  
  if (!deleted) {
    throw new ApiError(404, 'File not found or could not be deleted');
  }
  
  res.status(200).json({
    success: true,
    message: 'File deleted successfully'
  });
});
