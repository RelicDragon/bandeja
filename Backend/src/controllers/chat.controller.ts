import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { ChatType } from '@prisma/client';
import { SystemMessageType } from '../utils/systemMessages';
import { MessageService } from '../services/chat/message.service';
import { ReactionService } from '../services/chat/reaction.service';
import { ReadReceiptService } from '../services/chat/readReceipt.service';
import { SystemMessageService } from '../services/chat/systemMessage.service';
import prisma from '../config/database';

export const createSystemMessage = async (gameId: string, messageData: { type: SystemMessageType; variables: Record<string, string> }, chatType: ChatType = ChatType.PUBLIC) => {
  const message = await SystemMessageService.createSystemMessage(gameId, messageData, chatType);

  const socketService = (global as any).socketService;
  if (socketService) {
    socketService.emitNewMessage(gameId, message);
  }

  return message;
};

export const createMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId, content, mediaUrls = [], replyToId, chatType = ChatType.PUBLIC } = req.body;
  const senderId = req.userId;

  if (!senderId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const message = await MessageService.createMessageWithEvent({
    gameId,
    senderId,
    content,
    mediaUrls,
    replyToId,
    chatType
  });

  res.status(201).json({
    success: true,
    data: message
  });
});

export const getGameMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const userId = req.userId;
  const { page = 1, limit = 50, chatType = ChatType.PUBLIC } = req.query;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const messages = await MessageService.getMessages(gameId, userId, {
    page: Number(page),
    limit: Number(limit),
    chatType: chatType as ChatType
  });

  res.json({
    success: true,
    data: messages
  });
});

export const updateMessageState = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const { state } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const updatedMessage = await MessageService.updateMessageState(messageId, userId, state);

  res.json({
    success: true,
    data: updatedMessage
  });
});

export const markMessageAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const readReceipt = await ReadReceiptService.markMessageAsRead(messageId, userId);

  const socketService = (global as any).socketService;
  if (socketService) {
    // Get the gameId from the message to emit to the correct room
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { gameId: true }
    });
    
    if (message) {
      socketService.emitReadReceipt(message.gameId, readReceipt);
    }
  }

  res.json({ success: true });
});

export const addReaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const reaction = await ReactionService.addReaction(messageId, userId, emoji);

  const socketService = (global as any).socketService;
  if (socketService && reaction) {
    // Get the gameId from the message to emit to the correct room
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { gameId: true }
    });
    
    if (message) {
      socketService.emitMessageReaction(message.gameId, reaction);
    }
  }

  res.json({
    success: true,
    data: reaction
  });
});

export const removeReaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await ReactionService.removeReaction(messageId, userId);

  const socketService = (global as any).socketService;
  if (socketService) {
    // Get the gameId from the message to emit to the correct room
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { gameId: true }
    });
    
    if (message) {
      socketService.emitMessageReaction(message.gameId, result);
    }
  }

  res.json({ success: true });
});

export const getUserChatGames = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const games = await MessageService.getUserChatGames(userId);

  res.json({
    success: true,
    data: games
  });
});

export const getUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await ReadReceiptService.getUnreadCount(userId);

  res.json({
    success: true,
    data: result
  });
});

export const getGameUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await ReadReceiptService.getGameUnreadCount(gameId, userId);

  res.json({
    success: true,
    data: result
  });
});

export const getGamesUnreadCounts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameIds } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!gameIds || !Array.isArray(gameIds) || gameIds.length === 0) {
    throw new ApiError(400, 'Game IDs array is required');
  }

  const result = await ReadReceiptService.getGamesUnreadCounts(gameIds, userId);

  res.json({
    success: true,
    data: result
  });
});

export const deleteMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const message = await MessageService.deleteMessage(messageId, userId);

  const socketService = (global as any).socketService;
  if (socketService) {
    socketService.emitMessageDeleted(message.gameId, messageId);
  }

  res.json({ success: true });
});
