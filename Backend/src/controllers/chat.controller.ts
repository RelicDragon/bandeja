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
import { withTimeout } from '../utils/promiseWithTimeout';
import { ChatMuteService } from '../services/chat/chatMute.service';
import { TranslationService } from '../services/chat/translation.service';
import { DraftService } from '../services/chat/draft.service';
import { GameReadService } from '../services/game/read.service';
import { PollService } from '../services/chat/poll.service';
import { MessageSearchService } from '../services/chat/messageSearch.service';
import prisma from '../config/database';

export const createSystemMessage = async (contextId: string, messageData: { type: SystemMessageType; variables: Record<string, string> }, chatType: ChatType = ChatType.PUBLIC, chatContextType: ChatContextType = ChatContextType.GAME) => {
  const message = await SystemMessageService.createSystemMessage(contextId, messageData, chatType, chatContextType);

  const socketService = (global as any).socketService;
  if (socketService) {
    // OLD events (keep for backward compatibility - GAME, BUG, USER only)
    if (chatContextType === 'GAME') {
      socketService.emitNewMessage(contextId, message);
    } else if (chatContextType === 'BUG') {
      socketService.emitNewBugMessage(contextId, message);
    } else if (chatContextType === 'USER') {
      await socketService.emitNewUserMessage(contextId, message);
    }
    // GROUP uses only unified events (no old compatibility)

    // NEW unified event
    socketService.emitChatEvent(
      chatContextType,
      contextId,
      'message',
      { message }
    );
  }

  return message;
};

// Alias for backward compatibility
export const createBugSystemMessage = async (bugId: string, messageData: { type: SystemMessageType; variables: Record<string, string> }, chatType: ChatType = ChatType.PUBLIC) => {
  return createSystemMessage(bugId, messageData, chatType, ChatContextType.BUG);
};

export const createMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log('[createMessage] Request received:', {
    body: req.body,
    userId: req.userId,
    headers: req.headers
  });

  const { chatContextType = 'GAME', contextId, gameId, content, mediaUrls, replyToId, chatType = ChatType.PUBLIC, mentionIds = [], poll } = req.body;
  const senderId = req.userId;

  console.log('[createMessage] Parsed data:', {
    chatContextType,
    contextId,
    gameId,
    content: content ? `${content.substring(0, 50)}...` : null,
    mediaUrls,
    mediaUrlsType: typeof mediaUrls,
    mediaUrlsIsArray: Array.isArray(mediaUrls),
    replyToId,
    chatType,
    mentionIds,
    poll: poll ? 'Poll data present' : null,
    senderId
  });

  if (!senderId) {
    console.error('[createMessage] No senderId found');
    throw new ApiError(401, 'Unauthorized');
  }

  // Support legacy gameId parameter
  const finalContextId = contextId || gameId;
  console.log('[createMessage] Final contextId:', finalContextId);
  if (!finalContextId) {
    console.error('[createMessage] Missing contextId and gameId');
    throw new ApiError(400, 'contextId or gameId is required');
  }

  // Ensure mediaUrls is an array
  const finalMediaUrls = Array.isArray(mediaUrls) ? mediaUrls : [];
  console.log('[createMessage] Final mediaUrls:', finalMediaUrls);

  // Validate that message has content, media, or poll
  const hasContent = content && content.trim();
  const hasMedia = finalMediaUrls.length > 0;
  const hasPoll = poll && poll.question && poll.options && poll.options.length >= 2;
  console.log('[createMessage] Validation:', { hasContent, hasMedia, hasPoll, contentLength: content?.length });
  if (!hasContent && !hasMedia && !hasPoll) {
    console.error('[createMessage] Message has no content, media, or poll');
    throw new ApiError(400, 'Message must have content, media, or poll');
  }

  try {
    console.log('[createMessage] Calling MessageService.createMessageWithEvent with:', {
      chatContextType,
      contextId: finalContextId,
      senderId,
      contentLength: content?.length,
      mediaUrlsCount: finalMediaUrls.length,
      replyToId,
      chatType,
      mentionIdsCount: Array.isArray(mentionIds) ? mentionIds.length : 0
    });

    const message = await MessageService.createMessageWithEvent({
      chatContextType: chatContextType as ChatContextType,
      contextId: finalContextId,
      senderId,
      content,
      mediaUrls: finalMediaUrls,
      replyToId,
      chatType: chatType as ChatType,
      mentionIds: Array.isArray(mentionIds) ? mentionIds : [],
      poll
    });

    console.log('[createMessage] Message created successfully:', message.id);

    res.status(201).json({
      success: true,
      data: message
    });
  } catch (error: any) {
    console.error('[createMessage] Error creating message:', {
      error: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
      name: error.name
    });
    throw error;
  }
});



export const votePoll = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { pollId } = req.params;
  const { optionIds } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!optionIds || !Array.isArray(optionIds)) {
    throw new ApiError(400, 'Option IDs must be an array');
  }

  const updatedPoll = await PollService.vote(pollId, userId, optionIds);

  const socketService = (global as any).socketService;
  if (socketService) {
    // We need to notify about the vote update.
    // Ideally we should emit 'message-updated' or specific 'poll-updated' event.
    // 'message-updated' is usually for edits.
    // Let's check `updatedPoll.message`. We need to include message to know context.

    // PollService.vote calls finds unique with message include.
    // But updatedPoll return value might not have context info if we just return poll.
    // Let's fetch context info or ensure PollService returns it.

    // Actually PollService.vote query:
    // const updatedPoll = await prisma.poll.findUnique({ ... include: { options: ..., votes: ... } });
    // It does NOT include message context.

    // Let's fetch the message context separately or update PollService to return it.
    const message = await prisma.chatMessage.findUnique({
      where: { id: updatedPoll!.messageId },
      select: { chatContextType: true, contextId: true, gameId: true }
    });

    if (message) {
      const sanitized = updatedPoll!.isAnonymous
        ? { ...updatedPoll, options: updatedPoll!.options.map(o => ({ ...o, votes: o.votes.map(v => ({ ...v, user: undefined })) })), votes: updatedPoll!.votes.map(v => ({ ...v, user: undefined })) }
        : updatedPoll;
      socketService.emitChatEvent(
        message.chatContextType,
        message.contextId,
        'poll-vote',
        {
          pollId: updatedPoll!.id,
          messageId: updatedPoll!.messageId,
          updatedPoll: sanitized
        }
      );
    }
  }

  const responsePoll = updatedPoll!.isAnonymous
    ? { ...updatedPoll, options: updatedPoll!.options.map(o => ({ ...o, votes: o.votes.map(v => ({ ...v, user: undefined })) })), votes: updatedPoll!.votes.map(v => ({ ...v, user: undefined })) }
    : updatedPoll;
  res.json({
    success: true,
    data: responsePoll
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
      // OLD events (keep for backward compatibility - GAME, BUG, USER only)
      if (message.chatContextType === 'GAME') {
        socketService.emitReadReceipt(message.gameId || message.contextId, readReceipt);
      } else if (message.chatContextType === 'BUG') {
        socketService.emitBugReadReceipt(message.contextId, readReceipt);
      } else if (message.chatContextType === 'USER') {
        socketService.emitUserReadReceipt(message.contextId, readReceipt);
      }
      // GROUP uses only unified events (no old compatibility)

      // NEW unified event
      socketService.emitChatEvent(
        message.chatContextType,
        message.contextId,
        'read-receipt',
        { readReceipt }
      );

      // Emit unread count update
      const unreadCount = await ReadReceiptService.getUnreadCountForContext(
        message.chatContextType,
        message.contextId,
        userId
      );
      await socketService.emitUnreadCountUpdate(
        message.chatContextType,
        message.contextId,
        userId,
        unreadCount
      );
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
      // OLD events (keep for backward compatibility - GAME, BUG, USER only)
      if (message.chatContextType === 'GAME') {
        socketService.emitMessageReaction(message.gameId || message.contextId, reaction);
      } else if (message.chatContextType === 'BUG') {
        socketService.emitBugMessageReaction(message.contextId, reaction);
      } else if (message.chatContextType === 'USER') {
        socketService.emitUserMessageReaction(message.contextId, reaction);
      }
      // GROUP uses only unified events (no old compatibility)

      // NEW unified event
      socketService.emitChatEvent(
        message.chatContextType,
        message.contextId,
        'reaction',
        { reaction }
      );
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
      // OLD events (keep for backward compatibility)
      if (message.chatContextType === 'GAME') {
        socketService.emitMessageReaction(message.gameId || message.contextId, result);
      } else if (message.chatContextType === 'BUG') {
        socketService.emitBugMessageReaction(message.contextId, result);
      } else if (message.chatContextType === 'USER') {
        socketService.emitUserMessageReaction(message.contextId, result);
      }

      // NEW unified event
      socketService.emitChatEvent(
        message.chatContextType,
        message.contextId,
        'reaction',
        { reaction: result }
      );
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

const UNREAD_OBJECTS_TIMEOUT_MS = 15000;

export const getUnreadObjects = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const result = await withTimeout(
    UnreadObjectsService.getUnreadObjects(userId),
    UNREAD_OBJECTS_TIMEOUT_MS
  );

  res.json({
    success: true,
    data: result
  });
});

export const getGameParticipants = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const game = await GameReadService.getGameById(gameId, userId, true);
  const participants = (game.participants ?? []).map((p: any) => ({
    ...p,
    isPlaying: p.status === 'PLAYING',
  }));

  res.json({
    success: true,
    data: participants
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

    // Emit unread count update
    const unreadCount = await ReadReceiptService.getUnreadCountForContext(
      'GAME',
      gameId,
      userId
    );
    await socketService.emitUnreadCountUpdate(
      'GAME',
      gameId,
      userId,
      unreadCount
    );
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
    // OLD events (keep for backward compatibility - GAME, BUG, USER only)
    if (message.chatContextType === 'GAME' && message.gameId) {
      socketService.emitMessageDeleted(message.gameId, messageId);
    } else if (message.chatContextType === 'BUG') {
      socketService.emitBugMessageDeleted(message.contextId, messageId);
    } else if (message.chatContextType === 'USER') {
      socketService.emitUserMessageDeleted(message.contextId, messageId);
    }
    // GROUP uses only unified events (no old compatibility)

    // NEW unified event
    socketService.emitChatEvent(
      message.chatContextType,
      message.contextId,
      'deleted',
      { messageId }
    );
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

  const socketService = (global as any).socketService;
  if (socketService) {
    // Emit unread count update
    const unreadCount = await ReadReceiptService.getUnreadCountForContext(
      'USER',
      chatId,
      userId
    );
    await socketService.emitUnreadCountUpdate(
      'USER',
      chatId,
      userId,
      unreadCount
    );
  }

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

export const requestToChat = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const message = await UserChatService.requestToChat(chatId, userId);
  if (!message) {
    return res.status(400).json({ success: false, message: 'Chat is not empty' });
  }

  res.json({
    success: true,
    data: message
  });
});

export const respondToChatRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatId, messageId } = req.params;
  const userId = req.userId;
  const { accepted } = req.body;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (typeof accepted !== 'boolean') {
    throw new ApiError(400, 'accepted must be a boolean');
  }

  const result = await UserChatService.respondToChatRequest(chatId, messageId, userId, accepted);

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

export const translateMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: { content: true },
  });

  if (!message) {
    throw new ApiError(404, 'Message not found');
  }

  if (!message.content || !message.content.trim()) {
    throw new ApiError(400, 'Message has no text content to translate');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { language: true },
  });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const languageCode = TranslationService.extractLanguageCode(user.language);

  const translation = await TranslationService.getOrCreateTranslation(
    messageId,
    languageCode,
    userId,
    message.content
  );

  res.json({
    success: true,
    data: translation
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

  const validContextTypes = ['GAME', 'BUG', 'USER', 'GROUP'];
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

  const validContextTypes = ['GAME', 'BUG', 'USER', 'GROUP'];
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

  const validContextTypes = ['GAME', 'BUG', 'USER', 'GROUP'];
  if (!validContextTypes.includes(chatContextType as string)) {
    throw new ApiError(400, 'Invalid chatContextType');
  }

  const isMuted = await ChatMuteService.isChatMuted(userId, chatContextType as ChatContextType, contextId as string);

  res.json({
    success: true,
    data: { isMuted }
  });
});

export const confirmMessageReceipt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId, deliveryMethod } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!messageId) {
    throw new ApiError(400, 'messageId is required');
  }

  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId }
  });

  if (!message) {
    throw new ApiError(404, 'Message not found');
  }

  const socketService = (global as any).socketService;
  if (socketService) {
    if (deliveryMethod === 'socket') {
      socketService.markSocketDelivered(messageId, userId);
    } else if (deliveryMethod === 'push') {
      socketService.markPushDelivered(messageId, userId);
    }
  }

  res.json({ success: true });
});

export const getMissedMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contextType, contextId, lastMessageId } = req.query;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!contextType || !contextId) {
    throw new ApiError(400, 'contextType and contextId are required');
  }

  const validContextTypes = ['GAME', 'BUG', 'USER', 'GROUP'];
  if (!validContextTypes.includes(contextType as string)) {
    throw new ApiError(400, 'Invalid contextType');
  }

  // Get messages after the last known message
  const where: any = {
    chatContextType: contextType as ChatContextType,
    contextId: contextId as string,
    senderId: { not: userId }
  };

  if (lastMessageId) {
    const lastMessage = await prisma.chatMessage.findUnique({
      where: { id: lastMessageId as string },
      select: { createdAt: true }
    });

    if (lastMessage) {
      where.createdAt = { gt: lastMessage.createdAt };
    }
  }

  const messages = await MessageService.getMessages(
    contextType as ChatContextType,
    contextId as string,
    userId,
    { page: 1, limit: 100 }
  );

  res.json({
    success: true,
    data: messages
  });
});

export const markAllMessagesAsReadForContext = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contextType, contextId, chatTypes } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!contextType || !contextId) {
    throw new ApiError(400, 'contextType and contextId are required');
  }

  const validContextTypes = ['GAME', 'BUG', 'USER', 'GROUP'];
  if (!validContextTypes.includes(contextType)) {
    throw new ApiError(400, 'Invalid contextType');
  }

  const result = await ReadReceiptService.markAllMessagesAsReadForContext(
    contextType as ChatContextType,
    contextId,
    userId,
    chatTypes
  );

  const socketService = (global as any).socketService;
  if (socketService) {
    // Emit read receipt event
    socketService.emitChatEvent(
      contextType as ChatContextType,
      contextId,
      'read-receipt',
      { readReceipt: { userId, readAt: new Date() } }
    );

    // Emit unread count update
    const unreadCount = await ReadReceiptService.getUnreadCountForContext(
      contextType as ChatContextType,
      contextId,
      userId
    );
    await socketService.emitUnreadCountUpdate(
      contextType as ChatContextType,
      contextId,
      userId,
      unreadCount
    );
  }

  res.json({
    success: true,
    data: result
  });
});

export const saveDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatContextType, contextId, chatType = ChatType.PUBLIC, content, mentionIds = [] } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!chatContextType || !contextId) {
    throw new ApiError(400, 'chatContextType and contextId are required');
  }

  if (content && typeof content !== 'string') {
    throw new ApiError(400, 'Content must be a string');
  }

  if (!Array.isArray(mentionIds)) {
    throw new ApiError(400, 'mentionIds must be an array');
  }

  const draft = await DraftService.saveDraft(
    userId,
    chatContextType as ChatContextType,
    contextId,
    chatType as ChatType,
    content,
    mentionIds
  );

  res.json({
    success: true,
    data: draft
  });
});

export const getDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatContextType, contextId, chatType = ChatType.PUBLIC } = req.query;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!chatContextType || !contextId) {
    throw new ApiError(400, 'chatContextType and contextId are required');
  }

  const draft = await DraftService.getDraft(
    userId,
    chatContextType as ChatContextType,
    contextId as string,
    chatType as ChatType
  );

  res.json({
    success: true,
    data: draft
  });
});

export const getUserDrafts = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

  const result = await DraftService.getUserDrafts(userId, page, limit);

  res.json({
    success: true,
    data: result.drafts,
    pagination: result.pagination
  });
});

export const searchMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { q, section, messagesPage = 1, messagesLimit = 20, gamePage = 1, gameLimit = 20, bugsPage = 1, channelPage = 1, channelLimit = 20 } = req.query;
  if (!userId) throw new ApiError(401, 'Unauthorized');
  const result = await MessageSearchService.search(userId, String(q).trim(), {
    section: section as 'messages' | 'games' | 'channels' | 'bugs' | undefined,
    messagesPage: Number(messagesPage),
    messagesLimit: Number(messagesLimit),
    gamePage: Number(gamePage),
    gameLimit: Number(gameLimit),
    bugsPage: Number(bugsPage),
    channelPage: Number(channelPage),
    channelLimit: Number(channelLimit)
  });
  res.json({
    success: true,
    messages: result.messages,
    gameMessages: result.gameMessages,
    channelMessages: result.channelMessages,
    bugMessages: result.bugMessages,
    messagesPagination: result.messagesPagination,
    gamePagination: result.gamePagination,
    channelPagination: result.channelPagination,
    bugsPagination: result.bugsPagination
  });
});

export const deleteDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatContextType, contextId, chatType = ChatType.PUBLIC } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!chatContextType || !contextId) {
    throw new ApiError(400, 'chatContextType and contextId are required');
  }

  await DraftService.deleteDraft(
    userId,
    chatContextType as ChatContextType,
    contextId,
    chatType as ChatType
  );

  res.json({
    success: true
  });
});
