import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import multer, { FileFilterCallback } from 'multer';
import { ImageProcessor } from '../utils/imageProcessor';
import prisma from '../config/database';
import { hasParentGamePermission } from '../utils/parentGamePermissions';
import { ParticipantRole } from '@prisma/client';
import { MessageService } from '../services/chat/message.service';

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

export const uploadAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log('Upload avatar request files:', req.files);
  console.log('Upload avatar request body:', req.body);
  
  if (!req.files || !(req.files as any).avatar || !(req.files as any).original) {
    console.log('Missing files - req.files:', req.files);
    throw new ApiError(400, 'Both avatar and original image files are required');
  }

  const userId = req.userId;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  // Delete old avatars if exist
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true, originalAvatar: true }
  });

  if (user?.avatar) {
    await ImageProcessor.deleteFile(user.avatar);
  }
  if (user?.originalAvatar) {
    await ImageProcessor.deleteFile(user.originalAvatar);
  }

  const originalFile = Array.isArray((req.files as any).original) ? (req.files as any).original[0] : (req.files as any).original;

  // Process avatar using ImageProcessor
  const result = await ImageProcessor.processAvatar(originalFile.buffer, originalFile.originalname);

  // Update user avatars in database
  await prisma.user.update({
    where: { id: userId },
    data: { 
      avatar: result.avatarPath,
      originalAvatar: result.originalPath
    }
  });

  res.status(200).json({
    success: true,
    message: 'Avatar uploaded successfully',
    data: {
      avatarUrl: result.avatarPath,
      originalAvatarUrl: result.originalPath,
      avatarSize: result.avatarSize,
      originalSize: result.originalSize
    }
  });
});

export const uploadGameAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.files || !(req.files as any).avatar || !(req.files as any).original) {
    throw new ApiError(400, 'Both avatar and original image files are required');
  }

  const userId = req.userId;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const { gameId } = req.body;

  // Get old avatars for deletion
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      avatar: true,
      originalAvatar: true,
    }
  });

  // Delete old avatars if exist
  if (game?.avatar) {
    await ImageProcessor.deleteFile(game.avatar);
  }
  if (game?.originalAvatar) {
    await ImageProcessor.deleteFile(game.originalAvatar);
  }

  const originalFile = Array.isArray((req.files as any).original) ? (req.files as any).original[0] : (req.files as any).original;

  // Process avatar using ImageProcessor
  const result = await ImageProcessor.processAvatar(originalFile.buffer, originalFile.originalname);

  // Update game avatars in database
  await prisma.game.update({
    where: { id: gameId },
    data: { 
      avatar: result.avatarPath,
      originalAvatar: result.originalPath
    }
  });

  res.status(200).json({
    success: true,
    message: 'Game avatar uploaded successfully',
    data: {
      avatarUrl: result.avatarPath,
      originalAvatarUrl: result.originalPath,
      avatarSize: result.avatarSize,
      originalSize: result.originalSize
    }
  });
});

export const uploadChatImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No image file provided');
  }

  const { gameId, bugId, userChatId } = req.body;
  const senderId = req.userId;

  if (!senderId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!gameId && !bugId && !userChatId) {
    throw new ApiError(400, 'At least one of gameId, bugId, or userChatId is required');
  }

  // Validate access based on context type
  if (gameId) {
    await MessageService.validateGameAccess(gameId, senderId);
  } else if (bugId) {
    await MessageService.validateBugAccess(bugId, senderId, true);
  } else if (userChatId) {
    await MessageService.validateUserChatAccess(userChatId, senderId);
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
      invites: {
        where: { 
          receiverId: senderId,
          status: 'PENDING'
        }
      }
    }
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
  const hasPendingInvite = (game.invites?.length ?? 0) > 0;

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
