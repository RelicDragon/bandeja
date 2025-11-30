import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import multer, { FileFilterCallback } from 'multer';
import { ImageProcessor } from '../utils/imageProcessor';
import prisma from '../config/database';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { hasParentGamePermission } from '../utils/parentGamePermissions';
import { ParticipantRole } from '@prisma/client';

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

  const avatarFile = Array.isArray((req.files as any).avatar) ? (req.files as any).avatar[0] : (req.files as any).avatar;
  const originalFile = Array.isArray((req.files as any).original) ? (req.files as any).original[0] : (req.files as any).original;

  // Save avatar file (256x256 square)
  const uniqueId = crypto.randomUUID();
  const avatarExt = path.extname(avatarFile.originalname);
  const avatarName = `${uniqueId}_avatar${avatarExt}`;
  const avatarPath = path.join(ImageProcessor['UPLOAD_DIR'], 'avatars', 'circular', avatarName);
  
  // Ensure directory exists
  await fs.promises.mkdir(path.dirname(avatarPath), { recursive: true });
  await fs.promises.writeFile(avatarPath, avatarFile.buffer);

  // Save original file (downsized to 1920 max dimension)
  const originalExt = path.extname(originalFile.originalname);
  const originalName = `${uniqueId}_original${originalExt}`;
  const originalPath = path.join(ImageProcessor['UPLOAD_DIR'], 'avatars', 'originals', originalName);
  
  // Ensure directory exists
  await fs.promises.mkdir(path.dirname(originalPath), { recursive: true });
  await fs.promises.writeFile(originalPath, originalFile.buffer);

  // Get metadata for both files
  const avatarMetadata = await sharp(avatarFile.buffer).metadata();
  const originalMetadata = await sharp(originalFile.buffer).metadata();

  const avatarUrl = `/uploads/avatars/circular/${avatarName}`;
  const originalUrl = `/uploads/avatars/originals/${originalName}`;

  // Update user avatars in database
  await prisma.user.update({
    where: { id: userId },
    data: { 
      avatar: avatarUrl,
      originalAvatar: originalUrl
    }
  });

  res.status(200).json({
    success: true,
    message: 'Avatar uploaded successfully',
    data: {
      avatarUrl: avatarUrl,
      originalAvatarUrl: originalUrl,
      avatarSize: {
        width: avatarMetadata.width || 0,
        height: avatarMetadata.height || 0
      },
      originalSize: {
        width: originalMetadata.width || 0,
        height: originalMetadata.height || 0
      }
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
  if (!gameId) {
    throw new ApiError(400, 'Game ID is required');
  }

  // Verify user has permission to update game
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      avatar: true,
      originalAvatar: true,
    }
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const hasPermission = await hasParentGamePermission(
    gameId,
    userId,
    [ParticipantRole.OWNER, ParticipantRole.ADMIN]
  );

  if (!hasPermission) {
    throw new ApiError(403, 'Only owners and admins can update game avatar');
  }

  // Delete old avatars if exist
  if (game.avatar) {
    await ImageProcessor.deleteFile(game.avatar);
  }
  if (game.originalAvatar) {
    await ImageProcessor.deleteFile(game.originalAvatar);
  }

  const avatarFile = Array.isArray((req.files as any).avatar) ? (req.files as any).avatar[0] : (req.files as any).avatar;
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

  const { gameId } = req.body;
  const senderId = req.userId;

  if (!senderId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!gameId) {
    throw new ApiError(400, 'Game ID is required');
  }

  // Verify user has access to this game
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
    [ParticipantRole.OWNER, ParticipantRole.ADMIN, ParticipantRole.PARTICIPANT]
  );
  const hasPendingInvite = game.invites.length > 0;

  if (!hasPermission && !hasPendingInvite) {
    throw new ApiError(403, 'You are not a participant or invited to this game');
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
  const senderId = req.userId;

  if (!senderId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!gameId) {
    throw new ApiError(400, 'Game ID is required');
  }

  // Verify user has access to this game
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
    [ParticipantRole.OWNER, ParticipantRole.ADMIN, ParticipantRole.PARTICIPANT]
  );
  const hasPendingInvite = game.invites.length > 0;

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
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!gameId) {
    throw new ApiError(400, 'Game ID is required');
  }

  // Verify user has access to this game
  const game = await prisma.game.findUnique({
    where: { id: gameId },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const hasPermission = await hasParentGamePermission(
    gameId,
    userId,
    [ParticipantRole.OWNER, ParticipantRole.ADMIN, ParticipantRole.PARTICIPANT]
  );

  if (!hasPermission) {
    throw new ApiError(403, 'You are not a participant of this game');
  }

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
