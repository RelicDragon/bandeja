import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { GroupChannelService } from '../services/chat/groupChannel.service';
import { ChatType } from '@prisma/client';

export const createGroupChannel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { name, avatar, isChannel, isPublic } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ApiError(400, 'Name is required');
  }

  if (name.length > 100) {
    throw new ApiError(400, 'Name must be 100 characters or less');
  }

  const groupChannel = await GroupChannelService.createGroupChannel({
    name: name.trim(),
    avatar,
    isChannel: isChannel === true,
    isPublic: isPublic !== false,
    ownerId: userId
  });

  res.status(201).json({
    success: true,
    data: groupChannel
  });
});

export const getGroupChannels = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const groupChannels = await GroupChannelService.getGroupChannels(userId);

  res.json({
    success: true,
    data: groupChannels
  });
});

export const getPublicGroupChannels = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  const groupChannels = await GroupChannelService.getPublicGroupChannels(userId);

  res.json({
    success: true,
    data: groupChannels
  });
});

export const getGroupChannelById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const groupChannel = await GroupChannelService.getGroupChannelById(id, userId);

  res.json({
    success: true,
    data: groupChannel
  });
});

export const updateGroupChannel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, avatar, originalAvatar, isChannel, isPublic } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (name && (typeof name !== 'string' || name.trim().length === 0)) {
    throw new ApiError(400, 'Name must be a non-empty string');
  }

  if (name && name.length > 100) {
    throw new ApiError(400, 'Name must be 100 characters or less');
  }

  const updated = await GroupChannelService.updateGroupChannel(id, userId, {
    name: name?.trim(),
    avatar,
    originalAvatar,
    isChannel,
    isPublic
  });

  res.json({
    success: true,
    data: updated
  });
});

export const deleteGroupChannel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  await GroupChannelService.deleteGroupChannel(id, userId);

  res.json({
    success: true
  });
});

export const joinGroupChannel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await GroupChannelService.joinGroupChannel(id, userId);

  res.json({
    success: true,
    message: result
  });
});

export const leaveGroupChannel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await GroupChannelService.leaveGroupChannel(id, userId);

  res.json({
    success: true,
    message: result
  });
});

export const inviteUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { receiverId, message } = req.body;
  const senderId = req.userId;

  if (!senderId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!receiverId) {
    throw new ApiError(400, 'receiverId is required');
  }

  const invite = await GroupChannelService.inviteUser(id, senderId, receiverId, message);

  res.status(201).json({
    success: true,
    data: invite
  });
});

export const acceptInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { inviteId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await GroupChannelService.acceptInvite(inviteId, userId);

  res.json({
    success: true,
    message: result
  });
});

export const hideGroupChannel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  await GroupChannelService.hideGroupChannel(id, userId);

  res.json({
    success: true
  });
});

export const unhideGroupChannel = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  await GroupChannelService.unhideGroupChannel(id, userId);

  res.json({
    success: true
  });
});

export const getGroupChannelMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;
  const { page = 1, limit = 50, chatType = ChatType.PUBLIC } = req.query;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const { MessageService } = await import('../services/chat/message.service');
  const messages = await MessageService.getMessages('GROUP', id, userId, {
    page: Number(page),
    limit: Number(limit),
    chatType: chatType as ChatType
  });

  res.json({
    success: true,
    data: messages
  });
});

export const getGroupChannelUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const { ReadReceiptService } = await import('../services/chat/readReceipt.service');
  const result = await ReadReceiptService.getUnreadCountForContext('GROUP', id, userId);

  res.json({
    success: true,
    data: result
  });
});

export const markGroupChannelAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const { ReadReceiptService } = await import('../services/chat/readReceipt.service');
  const result = await ReadReceiptService.markAllMessagesAsReadForContext('GROUP', id, userId, undefined);

  const socketService = (global as any).socketService;
  if (socketService) {
    const unreadCount = await ReadReceiptService.getUnreadCountForContext('GROUP', id, userId);
    await socketService.emitUnreadCountUpdate('GROUP', id, userId, unreadCount);
  }

  res.json({
    success: true,
    data: result
  });
});

export const getParticipants = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const participants = await GroupChannelService.getParticipants(id, userId);

  res.json({
    success: true,
    data: participants
  });
});

export const getInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const invites = await GroupChannelService.getInvites(id, userId);

  res.json({
    success: true,
    data: invites
  });
});

export const promoteToAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, userId: targetUserId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await GroupChannelService.promoteToAdmin(id, targetUserId, userId);

  res.json({
    success: true,
    data: result
  });
});

export const removeAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, userId: targetUserId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await GroupChannelService.removeAdmin(id, targetUserId, userId);

  res.json({
    success: true,
    data: result
  });
});

export const removeParticipant = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id, userId: targetUserId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await GroupChannelService.removeParticipant(id, targetUserId, userId);

  res.json({
    success: true,
    data: result
  });
});

export const transferOwnership = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { newOwnerId } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!newOwnerId) {
    throw new ApiError(400, 'newOwnerId is required');
  }

  const result = await GroupChannelService.transferOwnership(id, newOwnerId, userId);

  res.json({
    success: true,
    data: result
  });
});

export const cancelInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { inviteId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await GroupChannelService.cancelInvite(inviteId, userId);

  res.json({
    success: true,
    data: result
  });
});
