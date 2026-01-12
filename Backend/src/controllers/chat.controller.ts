import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { ChatType, ChatContextType } from '@prisma/client';
import { SystemMessageType } from '../utils/systemMessages';
import { MessageService } from '../services/chat/message.service';
import { ReactionService } from '../services/chat/reaction.service';
import { ReadReceiptService } from '../services/chat/readReceipt.service';
import { SystemMessageService } from '../services/chat/systemMessage.service';
import { UserChatService } from '../services/chat/userChat.service';
import { MessageReportService } from '../services/chat/messageReport.service';
import { UnreadObjectsService } from '../services/chat/unreadObjects.service';
import { ChatMuteService } from '../services/chat/chatMute.service';
import prisma from '../config/database';

export const createSystemMessage = async (contextId: string, messageData: { type: SystemMessageType; variables: Record<string, string> }, chatType: ChatType = ChatType.PUBLIC, chatContextType: ChatContextType = ChatContextType.GAME) => {
  const message = await SystemMessageService.createSystemMessage(contextId, messageData, chatType, chatContextType);

  const socketService = (global as any).socketService;
  if (socketService) {
    if (chatContextType === 'GAME') {
      socketService.emitNewMessage(contextId, message);
    } else if (chatContextType === 'BUG') {
      socketService.emitNewBugMessage(contextId, message);
    } else if (chatContextType === 'USER') {
      await socketService.emitNewUserMessage(contextId, message);
    }
  }

  return message;
};

// Alias for backward compatibility
export const createBugSystemMessage = async (bugId: string, messageData: { type: SystemMessageType; variables: Record<string, string> }, chatType: ChatType = ChatType.PUBLIC) => {
  return createSystemMessage(bugId, messageData, chatType, ChatContextType.BUG);
};

export const createMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatContextType = 'GAME', contextId, gameId, content, mediaUrls = [], replyToId, chatType = ChatType.PUBLIC, mentionIds = [] } = req.body;
  const senderId = req.userId;

  if (!senderId) {
    throw new ApiError(401, 'Unauthorized');
  }

  // Support legacy gameId parameter
  const finalContextId = contextId || gameId;
  if (!finalContextId) {
    throw new ApiError(400, 'contextId or gameId is required');
  }

  const message = await MessageService.createMessageWithEvent({
    chatContextType: chatContextType as ChatContextType,
    contextId: finalContextId,
    senderId,
    content,
    mediaUrls,
    replyToId,
    chatType,
    mentionIds: Array.isArray(mentionIds) ? mentionIds : []
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

  const messages = await MessageService.getMessages('GAME', gameId, userId, {
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
    // Get the context from the message to emit to the correct room
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { chatContextType: true, contextId: true, gameId: true }
    });
    
    if (message) {
      if (message.chatContextType === 'GAME') {
        socketService.emitReadReceipt(message.gameId || message.contextId, readReceipt);
      } else if (message.chatContextType === 'BUG') {
        socketService.emitBugReadReceipt(message.contextId, readReceipt);
      } else if (message.chatContextType === 'USER') {
        socketService.emitUserReadReceipt(message.contextId, readReceipt);
      }
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
    // Get the context from the message to emit to the correct room
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { chatContextType: true, contextId: true, gameId: true }
    });
    
    if (message) {
      if (message.chatContextType === 'GAME') {
        socketService.emitMessageReaction(message.gameId || message.contextId, reaction);
      } else if (message.chatContextType === 'BUG') {
        socketService.emitBugMessageReaction(message.contextId, reaction);
      } else if (message.chatContextType === 'USER') {
        socketService.emitUserMessageReaction(message.contextId, reaction);
      }
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
    // Get the context from the message to emit to the correct room
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { chatContextType: true, contextId: true, gameId: true }
    });
    
    if (message) {
      if (message.chatContextType === 'GAME') {
        socketService.emitMessageReaction(message.gameId || message.contextId, result);
      } else if (message.chatContextType === 'BUG') {
        socketService.emitBugMessageReaction(message.contextId, result);
      } else if (message.chatContextType === 'USER') {
        socketService.emitUserMessageReaction(message.contextId, result);
      }
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

export const getUnreadObjects = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await UnreadObjectsService.getUnreadObjects(userId);

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

export const markAllMessagesAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const { chatTypes } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!gameId) {
    throw new ApiError(400, 'Game ID is required');
  }

  const result = await ReadReceiptService.markAllMessagesAsRead(gameId, userId, chatTypes);

  const socketService = (global as any).socketService;
  if (socketService) {
    socketService.emitReadReceipt(gameId, { userId, readAt: new Date() });
  }

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
    if (message.chatContextType === 'GAME' && message.gameId) {
      socketService.emitMessageDeleted(message.gameId, messageId);
    } else if (message.chatContextType === 'BUG') {
      socketService.emitBugMessageDeleted(message.contextId, messageId);
    } else if (message.chatContextType === 'USER') {
      socketService.emitUserMessageDeleted(message.contextId, messageId);
    }
  }

  res.json({ success: true });
});

// User Chat Controllers
export const getUserChats = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const chats = await UserChatService.getUserChats(userId);

  res.json({
    success: true,
    data: chats
  });
});

export const getOrCreateChatWithUser = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { userId: otherUserId } = req.params;
  const currentUserId = req.userId;

  if (!currentUserId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const chat = await UserChatService.getOrCreateChatWithUser(currentUserId, otherUserId);

  res.json({
    success: true,
    data: chat
  });
});

export const getUserChatMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatId } = req.params;
  const userId = req.userId;
  const { page = 1, limit = 50 } = req.query;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const messages = await MessageService.getMessages('USER', chatId, userId, {
    page: Number(page),
    limit: Number(limit),
    chatType: ChatType.PUBLIC
  });

  res.json({
    success: true,
    data: messages
  });
});

export const getUserChatUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await ReadReceiptService.getUserChatUnreadCount(chatId, userId);

  res.json({
    success: true,
    data: result
  });
});

export const getUserChatsUnreadCounts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatIds } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!chatIds || !Array.isArray(chatIds) || chatIds.length === 0) {
    throw new ApiError(400, 'Chat IDs array is required');
  }

  const unreadCounts = await ReadReceiptService.getUserChatsUnreadCounts(chatIds, userId);

  res.json({
    success: true,
    data: unreadCounts
  });
});

export const markUserChatAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await ReadReceiptService.markUserChatAsRead(chatId, userId);

  res.json({
    success: true,
    data: result
  });
});

export const pinUserChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const pinnedChat = await UserChatService.pinUserChat(userId, chatId);

  res.json({
    success: true,
    data: pinnedChat
  });
});

export const unpinUserChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  await UserChatService.unpinUserChat(userId, chatId);

  res.json({
    success: true
  });
});

// Bug Chat Controllers
export const getBugMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { bugId } = req.params;
  const userId = req.userId;
  const { page = 1, limit = 50, chatType = ChatType.PUBLIC } = req.query;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const messages = await MessageService.getMessages(ChatContextType.BUG, bugId, userId, {
    page: Number(page),
    limit: Number(limit),
    chatType: chatType as ChatType
  });

  res.json({
    success: true,
    data: messages
  });
});

export const getBugLastUserMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { bugId } = req.params;
  const userId = req.userId;
  const { chatType = ChatType.PUBLIC } = req.query;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const message = await MessageService.getLastUserMessage(
    ChatContextType.BUG,
    bugId,
    userId,
    chatType as ChatType
  );

  res.json({
    success: true,
    data: message
  });
});

export const getBugUnreadCount = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { bugId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await ReadReceiptService.getBugUnreadCount(bugId, userId);

  res.json({
    success: true,
    data: result
  });
});

export const getBugsUnreadCounts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { bugIds } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!bugIds || !Array.isArray(bugIds) || bugIds.length === 0) {
    throw new ApiError(400, 'Bug IDs array is required');
  }

  const result = await ReadReceiptService.getBugsUnreadCounts(bugIds, userId);

  res.json({
    success: true,
    data: result
  });
});

export const markAllBugMessagesAsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { bugId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!bugId) {
    throw new ApiError(400, 'Bug ID is required');
  }

  const result = await ReadReceiptService.markAllBugMessagesAsRead(bugId, userId);

  const socketService = (global as any).socketService;
  if (socketService) {
    socketService.emitBugReadReceipt(bugId, { userId, readAt: new Date() });
  }

  res.json({
    success: true,
    data: result
  });
});

export const reportMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const { reason, description } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!reason) {
    throw new ApiError(400, 'Reason is required');
  }

  const validReasons = ['SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'FAKE_INFORMATION', 'OTHER'];
  if (!validReasons.includes(reason)) {
    throw new ApiError(400, 'Invalid reason');
  }

  if (reason === 'OTHER' && !description?.trim()) {
    throw new ApiError(400, 'Description is required when reason is OTHER');
  }

  const report = await MessageReportService.reportMessage(messageId, userId, reason, description);

  res.status(201).json({
    success: true,
    data: report
  });
});

export const muteChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatContextType, contextId } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!chatContextType || !contextId) {
    throw new ApiError(400, 'chatContextType and contextId are required');
  }

  const validContextTypes = ['GAME', 'BUG', 'USER'];
  if (!validContextTypes.includes(chatContextType)) {
    throw new ApiError(400, 'Invalid chatContextType');
  }

  const chatMute = await ChatMuteService.muteChat(userId, chatContextType as ChatContextType, contextId);

  res.json({
    success: true,
    data: chatMute
  });
});

export const unmuteChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatContextType, contextId } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!chatContextType || !contextId) {
    throw new ApiError(400, 'chatContextType and contextId are required');
  }

  const validContextTypes = ['GAME', 'BUG', 'USER'];
  if (!validContextTypes.includes(chatContextType)) {
    throw new ApiError(400, 'Invalid chatContextType');
  }

  await ChatMuteService.unmuteChat(userId, chatContextType as ChatContextType, contextId);

  res.json({
    success: true
  });
});

export const isChatMuted = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatContextType, contextId } = req.query;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!chatContextType || !contextId) {
    throw new ApiError(400, 'chatContextType and contextId are required');
  }

  const validContextTypes = ['GAME', 'BUG', 'USER'];
  if (!validContextTypes.includes(chatContextType as string)) {
    throw new ApiError(400, 'Invalid chatContextType');
  }

  const isMuted = await ChatMuteService.isChatMuted(userId, chatContextType as ChatContextType, contextId as string);

  res.json({
    success: true,
    data: { isMuted }
  });
});
