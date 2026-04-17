import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { ChatType, ChatContextType, MessageType } from '@prisma/client';
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
import { ChatTranslationPreferenceService } from '../services/chat/chatTranslationPreference.service';
import { TranslationService, TRANSLATE_TO_LANGUAGE_CODES } from '../services/chat/translation.service';
import { TranscriptionService } from '../services/chat/transcription.service';
import { MESSAGE_TRANSCRIPTION_PENDING } from '../services/chat/transcriptionPending';
import { DraftService } from '../services/chat/draft.service';
import { GameReadService } from '../services/game/read.service';
import { PollService } from '../services/chat/poll.service';
import { MessageSearchService } from '../services/chat/messageSearch.service';
import { PinnedMessageService } from '../services/chat/pinnedMessage.service';
import prisma from '../config/database';
import { ChatSyncEventService } from '../services/chat/chatSyncEvent.service';
import { ChatMutationIdempotencyService } from '../services/chat/chatMutationIdempotency.service';
import { hashChatMutationPayload } from '../utils/chatClientMutationId';
import { ChatListRowPreviewService } from '../services/chat/chatListRowPreview.service';

async function notifyUserIdsForUserChat(contextId: string): Promise<string[] | undefined> {
  const peers = await prisma.userChat.findUnique({
    where: { id: contextId },
    select: { user1Id: true, user2Id: true },
  });
  if (!peers) return undefined;
  const pair = [peers.user1Id, peers.user2Id].filter((id): id is string => typeof id === 'string' && id.length > 0);
  return new Set(pair).size === 2 ? pair : undefined;
}

export const postChatListRowPreviews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }
  const { groupChannelIds, userChatIds } = req.body as {
    groupChannelIds?: unknown;
    userChatIds?: unknown;
  };
  const g = Array.isArray(groupChannelIds) ? (groupChannelIds as string[]) : [];
  const u = Array.isArray(userChatIds) ? (userChatIds as string[]) : [];
  const MAX = 400;
  if (g.length > MAX || u.length > MAX) {
    throw new ApiError(400, `At most ${MAX} groupChannelIds and ${MAX} userChatIds per request`);
  }
  const data = await ChatListRowPreviewService.getPreviews(userId, g, u);
  res.json({ success: true, data });
});

export const createSystemMessage = (
  contextId: string,
  messageData: { type: SystemMessageType; variables: Record<string, string> },
  chatType: ChatType = ChatType.PUBLIC,
  chatContextType: ChatContextType = ChatContextType.GAME
) => SystemMessageService.createSystemMessageWithEmit(contextId, messageData, chatType, chatContextType);

export const createMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log('[createMessage] Request received:', {
    body: req.body,
    userId: req.userId,
    headers: req.headers
  });

  const {
    chatContextType = 'GAME',
    contextId,
    content,
    mediaUrls,
    replyToId,
    chatType = ChatType.PUBLIC,
    mentionIds = [],
    poll,
    messageType: rawMessageType,
    audioDurationMs: rawAudioDurationMs,
    waveformData: rawWaveformData,
    clientMutationId: rawClientMutationId,
  } = req.body;
  const senderId = req.userId;

  console.log('[createMessage] Parsed data:', {
    chatContextType,
    contextId,
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

  if (!contextId) {
    console.error('[createMessage] Missing contextId');
    throw new ApiError(400, 'contextId is required');
  }

  // Ensure mediaUrls is an array
  const finalMediaUrls = Array.isArray(mediaUrls) ? mediaUrls : [];
  const messageType = rawMessageType === 'VOICE' ? MessageType.VOICE : undefined;
  const audioDurationMs =
    rawAudioDurationMs != null && rawAudioDurationMs !== '' ? Number(rawAudioDurationMs) : undefined;
  const waveformData = Array.isArray(rawWaveformData)
    ? rawWaveformData.map((x: unknown) => Number(x)).filter((x: number) => !Number.isNaN(x))
    : undefined;
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
      contextId,
      senderId,
      contentLength: content?.length,
      mediaUrlsCount: finalMediaUrls.length,
      replyToId,
      chatType,
      mentionIdsCount: Array.isArray(mentionIds) ? mentionIds.length : 0
    });

    const clientMutationId =
      typeof rawClientMutationId === 'string' ? rawClientMutationId.trim() : undefined;

    const message = await MessageService.createMessageWithEvent({
      chatContextType: chatContextType as ChatContextType,
      contextId,
      senderId,
      content,
      mediaUrls: finalMediaUrls,
      replyToId,
      chatType: chatType as ChatType,
      mentionIds: Array.isArray(mentionIds) ? mentionIds : [],
      poll,
      messageType,
      audioDurationMs: audioDurationMs !== undefined && !Number.isNaN(audioDurationMs) ? audioDurationMs : undefined,
      waveformData,
      clientMutationId: clientMutationId || undefined,
    });

    console.log('[createMessage] Message created successfully:', message.id);

    const deduped = !!(message as { _deduped?: boolean })._deduped;
    delete (message as { _deduped?: boolean })._deduped;

    res.status(deduped ? 200 : 201).json({
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

  const { poll: updatedPoll, syncSeq } = await PollService.vote(pollId, userId, optionIds);
  if (!updatedPoll) {
    throw new ApiError(500, 'Poll vote failed');
  }

  const socketService = (global as any).socketService;
  if (socketService) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: updatedPoll.messageId },
      select: { chatContextType: true, contextId: true }
    });

    if (message) {
      const sanitized = updatedPoll.isAnonymous
        ? { ...updatedPoll, options: updatedPoll.options.map(o => ({ ...o, votes: o.votes.map(v => ({ ...v, user: undefined })) })), votes: updatedPoll.votes.map(v => ({ ...v, user: undefined })) }
        : updatedPoll;
      const notifyUserIdsPoll =
        message.chatContextType === ChatContextType.USER
          ? await notifyUserIdsForUserChat(message.contextId)
          : undefined;
      socketService.emitChatEvent(
        message.chatContextType,
        message.contextId,
        'poll-vote',
        {
          pollId: updatedPoll.id,
          messageId: updatedPoll.messageId,
          updatedPoll: sanitized
        },
        updatedPoll.messageId,
        syncSeq,
        notifyUserIdsPoll
      );
    }
  }

  const responsePoll = updatedPoll.isAnonymous
    ? { ...updatedPoll, options: updatedPoll.options.map(o => ({ ...o, votes: o.votes.map(v => ({ ...v, user: undefined })) })), votes: updatedPoll.votes.map(v => ({ ...v, user: undefined })) }
    : updatedPoll;
  res.json({
    success: true,
    data: responsePoll
  });
});

export const getGameMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const userId = req.userId;
  const { page = 1, limit = 50, chatType = ChatType.PUBLIC, beforeMessageId } = req.query;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const messages = await MessageService.getMessages('GAME', gameId, userId, {
    page: Number(page),
    limit: Number(limit),
    chatType: chatType as ChatType,
    ...(typeof beforeMessageId === 'string' && beforeMessageId ? { beforeMessageId } : {})
  });

  res.json({
    success: true,
    data: messages
  });
});

export const getBugMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { bugId } = req.params;
  const userId = req.userId;
  const { page = 1, limit = 50, beforeMessageId } = req.query;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const messages = await MessageService.getMessages('BUG', bugId, userId, {
    page: Number(page),
    limit: Number(limit),
    chatType: ChatType.PUBLIC,
    ...(typeof beforeMessageId === 'string' && beforeMessageId ? { beforeMessageId } : {})
  });

  res.json({
    success: true,
    data: messages
  });
});

export const getChatMessageById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const userId = req.userId;
  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }
  const message = await MessageService.getMessageById(messageId, userId);
  res.json({ success: true, data: message });
});

export const getPinnedMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { contextType, contextId, chatType = ChatType.PUBLIC } = req.query;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }
  if (!contextType || !contextId || typeof contextType !== 'string' || typeof contextId !== 'string') {
    throw new ApiError(400, 'contextType and contextId are required');
  }
  if (!['GAME', 'BUG', 'USER', 'GROUP'].includes(contextType)) {
    throw new ApiError(400, 'Invalid contextType');
  }

  const messages = await PinnedMessageService.getPinnedMessages(
    contextType as ChatContextType,
    contextId,
    (typeof chatType === 'string' ? chatType : ChatType.PUBLIC) as ChatType,
    userId
  );

  res.json({
    success: true,
    data: messages
  });
});

export const pinMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const { clientMutationId: rawCid } = req.body ?? {};
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const idem = await ChatMutationIdempotencyService.begin(userId, rawCid, 'pin', messageId, null);
  if (idem.outcome === 'cached') {
    res.json(idem.body);
    return;
  }
  if (idem.outcome === 'conflict') {
    throw new ApiError(409, 'This change is already being processed. Try again in a moment.');
  }
  const leaseCid = idem.outcome === 'lease' ? idem.cid : null;

  try {
    await PinnedMessageService.pinMessage(messageId, userId);
    const body = { success: true, data: { pinned: true } };
    if (leaseCid) await ChatMutationIdempotencyService.complete(userId, leaseCid, body);
    res.json(body);
  } catch (e) {
    if (leaseCid) await ChatMutationIdempotencyService.abort(userId, leaseCid);
    throw e;
  }
});

export const unpinMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const rawCid = (req.query.clientMutationId as string | undefined) ?? (req.body as { clientMutationId?: string } | undefined)?.clientMutationId;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const idem = await ChatMutationIdempotencyService.begin(userId, rawCid, 'unpin', messageId, null);
  if (idem.outcome === 'cached') {
    res.json(idem.body);
    return;
  }
  if (idem.outcome === 'conflict') {
    throw new ApiError(409, 'This change is already being processed. Try again in a moment.');
  }
  const leaseCid = idem.outcome === 'lease' ? idem.cid : null;

  try {
    await PinnedMessageService.unpinMessage(messageId, userId);
    const body = { success: true, data: { pinned: false } };
    if (leaseCid) await ChatMutationIdempotencyService.complete(userId, leaseCid, body);
    res.json(body);
  } catch (e) {
    if (leaseCid) await ChatMutationIdempotencyService.abort(userId, leaseCid);
    throw e;
  }
});

export const updateMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const { content, mentionIds, clientMutationId: rawCid } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const payloadHash = hashChatMutationPayload({
    content: (content ?? '').trim(),
    mentionIds: Array.isArray(mentionIds) ? [...mentionIds].sort() : [],
  });
  const idem = await ChatMutationIdempotencyService.begin(userId, rawCid, 'edit', messageId, payloadHash);
  if (idem.outcome === 'cached') {
    res.json(idem.body);
    return;
  }
  if (idem.outcome === 'conflict') {
    throw new ApiError(409, 'This change is already being processed. Try again in a moment.');
  }

  const leaseCid = idem.outcome === 'lease' ? idem.cid : null;

  try {
    const updatedMessage = await MessageService.updateMessageContent(messageId, userId, {
      content: content ?? '',
      mentionIds
    });

    const body = { success: true, data: updatedMessage };
    if (leaseCid) {
      await ChatMutationIdempotencyService.complete(userId, leaseCid, body);
    }

    const socketService = (global as any).socketService;
    if (socketService) {
      const notifyUserIds =
        updatedMessage.chatContextType === ChatContextType.USER
          ? await notifyUserIdsForUserChat(updatedMessage.contextId)
          : undefined;
      socketService.emitChatEvent(
        updatedMessage.chatContextType,
        updatedMessage.contextId,
        'message-updated',
        { message: updatedMessage },
        updatedMessage.id,
        (updatedMessage as { syncSeq?: number }).syncSeq,
        notifyUserIds
      );
    }

    res.json(body);
  } catch (e) {
    if (leaseCid) {
      await ChatMutationIdempotencyService.abort(userId, leaseCid);
    }
    throw e;
  }
});

export const updateMessageState = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const { state } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const updatedMessage = await MessageService.updateMessageState(messageId, userId, state);
  const syncSeq = (updatedMessage as { syncSeq?: number }).syncSeq;

  const socketService = (global as any).socketService;
  if (socketService) {
    const notifyUserIds =
      updatedMessage.chatContextType === ChatContextType.USER
        ? await notifyUserIdsForUserChat(updatedMessage.contextId)
        : undefined;
    socketService.emitChatEvent(
      updatedMessage.chatContextType,
      updatedMessage.contextId,
      'message-updated',
      { message: updatedMessage },
      messageId,
      syncSeq,
      notifyUserIds
    );
  }

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

  const marked = await ReadReceiptService.markMessageAsRead(messageId, userId);
  const { syncSeq, ...readReceipt } = marked;

  const socketService = (global as any).socketService;
  if (socketService) {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { chatContextType: true, contextId: true }
    });

    if (message) {
      const notifyUserIds =
        message.chatContextType === ChatContextType.USER
          ? await notifyUserIdsForUserChat(message.contextId)
          : undefined;
      socketService.emitChatEvent(
        message.chatContextType,
        message.contextId,
        'read-receipt',
        { readReceipt },
        messageId,
        syncSeq,
        notifyUserIds
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
  const { emoji, clientMutationId: rawCid } = req.body;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const payloadHash = hashChatMutationPayload({ emoji: String(emoji ?? '') });
  const idem = await ChatMutationIdempotencyService.begin(userId, rawCid, 'reaction_add', messageId, payloadHash);
  if (idem.outcome === 'cached') {
    const cached = idem.body as { success?: boolean; data?: Record<string, unknown> };
    if (
      cached?.success &&
      cached.data &&
      !('emojiUsage' in cached.data) &&
      typeof (cached.data as { messageId?: string }).messageId === 'string'
    ) {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { reactionEmojiUsageVersion: true },
      });
      const reaction = cached.data as Record<string, unknown>;
      res.json({
        ...cached,
        data: {
          ...reaction,
          emojiUsage: { version: u?.reactionEmojiUsageVersion ?? 0, touched: null },
        },
      });
      return;
    }
    res.json(idem.body);
    return;
  }
  if (idem.outcome === 'conflict') {
    throw new ApiError(409, 'This change is already being processed. Try again in a moment.');
  }
  const leaseCid = idem.outcome === 'lease' ? idem.cid : null;

  try {
    const { reaction, syncSeq, emojiUsage } = await ReactionService.addReaction(messageId, userId, emoji);

    const body = { success: true, data: { ...reaction, emojiUsage } };
    if (leaseCid) await ChatMutationIdempotencyService.complete(userId, leaseCid, body);

    const socketService = (global as any).socketService;
    if (socketService && reaction) {
      const message = await prisma.chatMessage.findUnique({
        where: { id: messageId },
        select: { chatContextType: true, contextId: true }
      });

      if (message) {
        const notifyUserIds =
          message.chatContextType === ChatContextType.USER
            ? await notifyUserIdsForUserChat(message.contextId)
            : undefined;
        socketService.emitChatEvent(
          message.chatContextType,
          message.contextId,
          'reaction',
          { reaction },
          messageId,
          syncSeq,
          notifyUserIds
        );
      }
    }

    res.json(body);
  } catch (e) {
    if (leaseCid) await ChatMutationIdempotencyService.abort(userId, leaseCid);
    throw e;
  }
});

export const removeReaction = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const rawCid = req.query.clientMutationId as string | undefined;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const idem = await ChatMutationIdempotencyService.begin(userId, rawCid, 'reaction_remove', messageId, null);
  if (idem.outcome === 'cached') {
    res.json(idem.body);
    return;
  }
  if (idem.outcome === 'conflict') {
    throw new ApiError(409, 'This change is already being processed. Try again in a moment.');
  }
  const leaseCid = idem.outcome === 'lease' ? idem.cid : null;

  try {
    const result = await ReactionService.removeReaction(messageId, userId);

    const body = { success: true };
    if (leaseCid) await ChatMutationIdempotencyService.complete(userId, leaseCid, body);

    const socketService = (global as any).socketService;
    if (socketService) {
      const message = await prisma.chatMessage.findUnique({
        where: { id: messageId },
        select: { chatContextType: true, contextId: true }
      });

      if (message) {
        const notifyUserIds =
          message.chatContextType === ChatContextType.USER
            ? await notifyUserIdsForUserChat(message.contextId)
            : undefined;
        socketService.emitChatEvent(
          message.chatContextType,
          message.contextId,
          'reaction',
          { reaction: result },
          messageId,
          result.syncSeq,
          notifyUserIds
        );
      }
    }

    res.json(body);
  } catch (e) {
    if (leaseCid) await ChatMutationIdempotencyService.abort(userId, leaseCid);
    throw e;
  }
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

  const game = await GameReadService.getGameById(gameId, userId, true) as any;
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
    if (result.count > 0 && result.syncSeq != null) {
      socketService.emitChatEvent(
        'GAME',
        gameId,
        'read-receipt',
        { readReceipt: { userId, readAt: new Date().toISOString(), allRead: true } },
        undefined,
        result.syncSeq
      );
    }

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
  const rawCid = req.query.clientMutationId as string | undefined;
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const idem = await ChatMutationIdempotencyService.begin(userId, rawCid, 'delete', messageId, null);
  if (idem.outcome === 'cached') {
    res.json(idem.body);
    return;
  }
  if (idem.outcome === 'conflict') {
    throw new ApiError(409, 'This change is already being processed. Try again in a moment.');
  }
  const leaseCid = idem.outcome === 'lease' ? idem.cid : null;

  try {
    const message = await MessageService.deleteMessage(messageId, userId);

    const body = { success: true };
    if (leaseCid) await ChatMutationIdempotencyService.complete(userId, leaseCid, body);

    const socketService = (global as any).socketService;
    if (socketService) {
      const notifyUserIds =
        message.chatContextType === ChatContextType.USER
          ? await notifyUserIdsForUserChat(message.contextId)
          : undefined;
      socketService.emitChatEvent(
        message.chatContextType,
        message.contextId,
        'deleted',
        { messageId: message.id },
        message.id,
        (message as { syncSeq?: number }).syncSeq,
        notifyUserIds
      );
    }

    res.json(body);
  } catch (e) {
    if (leaseCid) await ChatMutationIdempotencyService.abort(userId, leaseCid);
    throw e;
  }
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
  const { page = 1, limit = 50, beforeMessageId } = req.query;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const messages = await MessageService.getMessages('USER', chatId, userId, {
    page: Number(page),
    limit: Number(limit),
    chatType: ChatType.PUBLIC,
    ...(typeof beforeMessageId === 'string' && beforeMessageId ? { beforeMessageId } : {})
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
    if (result.count > 0 && result.syncSeq != null) {
      const peers = await prisma.userChat.findUnique({
        where: { id: chatId },
        select: { user1Id: true, user2Id: true },
      });
      const notifyUserIds = peers
        ? [peers.user1Id, peers.user2Id].filter((id): id is string => typeof id === 'string' && id.length > 0)
        : undefined;
      socketService.emitChatEvent(
        'USER',
        chatId,
        'read-receipt',
        { readReceipt: { userId, readAt: new Date().toISOString(), allRead: true } },
        undefined,
        result.syncSeq,
        notifyUserIds
      );
    }
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
    select: { content: true, messageType: true },
  });

  if (!message) {
    throw new ApiError(404, 'Message not found');
  }

  let sourceText = message.content?.trim() ?? '';
  if (!sourceText && message.messageType === MessageType.VOICE) {
    const tr = await prisma.messageTranscription.findUnique({
      where: { messageId },
      select: { transcription: true },
    });
    if (tr?.transcription && tr.transcription !== MESSAGE_TRANSCRIPTION_PENDING) {
      sourceText = tr.transcription.trim();
    }
  }

  if (!sourceText) {
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
    sourceText
  );

  res.json({
    success: true,
    data: translation
  });
});

export const transcribeMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageId } = req.params;
  const userId = req.userId;

  if (!userId) {
    console.warn('[transcription] http_unauthorized', { messageId });
    throw new ApiError(401, 'Unauthorized');
  }

  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: {
      messageType: true,
      mediaUrls: true,
      audioDurationMs: true,
      chatContextType: true,
      contextId: true,
      chatType: true,
    },
  });

  if (!message) {
    console.warn('[transcription] http_message_not_found', { messageId, userId });
    throw new ApiError(404, 'Message not found');
  }

  if (message.messageType !== MessageType.VOICE) {
    console.warn('[transcription] http_not_voice_message', {
      messageId,
      userId,
      messageType: message.messageType,
    });
    throw new ApiError(400, 'Only voice messages can be transcribed');
  }

  const audioUrl = message.mediaUrls[0];
  if (!audioUrl?.trim()) {
    console.warn('[transcription] http_no_media_url', { messageId, userId, mediaCount: message.mediaUrls?.length ?? 0 });
    throw new ApiError(400, 'Voice message has no audio');
  }

  try {
    await MessageService.validateMessageAccess(message, userId, false);
  } catch (e: unknown) {
    console.warn('[transcription] http_access_denied', {
      messageId,
      userId,
      contextType: message.chatContextType,
      contextId: message.contextId,
      isApiError: e instanceof ApiError,
      statusCode: e instanceof ApiError ? e.statusCode : undefined,
      message: e instanceof ApiError ? e.message : (e as Error)?.message,
    });
    throw e;
  }

  try {
    const data = await TranscriptionService.getOrCreateTranscription(
      messageId,
      userId,
      audioUrl,
      message.audioDurationMs
    );

    const socketService = (global as any).socketService;
    if (socketService?.emitMessageTranscription) {
      socketService.emitMessageTranscription(
        message.chatContextType,
        message.contextId,
        messageId,
        { transcription: data.transcription, languageCode: data.languageCode },
        data.syncSeq
      );
    }

    res.json({
      success: true,
      data,
    });
  } catch (e: unknown) {
    if (!(e instanceof ApiError)) {
      console.error('[transcription] http_service_unexpected_error', {
        messageId,
        userId,
        raw: e,
      });
    }
    throw e;
  }
});

const TRANSLATE_DRAFT_MAX_LENGTH = 4000;

export const translateDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized');

  const { text, languageCode } = req.body;
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) throw new ApiError(400, 'Text to translate is required');
  if (trimmed.length > TRANSLATE_DRAFT_MAX_LENGTH) {
    throw new ApiError(400, `Text must be at most ${TRANSLATE_DRAFT_MAX_LENGTH} characters.`);
  }

  const code = typeof languageCode === 'string' ? languageCode.toLowerCase() : '';
  if (!code || !TRANSLATE_TO_LANGUAGE_CODES.includes(code)) {
    throw new ApiError(400, `Invalid languageCode. Allowed: ${TRANSLATE_TO_LANGUAGE_CODES.join(', ')}`);
  }

  const translation = await TranslationService.getTranslationFromChatGPT(trimmed, code, userId);

  res.json({
    success: true,
    data: { translation, languageCode: code },
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

export const getChatTranslationPreference = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatContextType, contextId } = req.query;
  const userId = req.userId;

  if (!userId) throw new ApiError(401, 'Unauthorized');
  if (!chatContextType || !contextId) throw new ApiError(400, 'chatContextType and contextId are required');
  const validContextTypes = ['GAME', 'BUG', 'USER', 'GROUP'];
  if (!validContextTypes.includes(chatContextType as string)) throw new ApiError(400, 'Invalid chatContextType');

  const translateToLanguage = await ChatTranslationPreferenceService.get(userId, chatContextType as ChatContextType, contextId as string);
  res.json({ success: true, data: { translateToLanguage } });
});

export const setChatTranslationPreference = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { chatContextType, contextId, translateToLanguage } = req.body;
  const userId = req.userId;

  if (!userId) throw new ApiError(401, 'Unauthorized');
  if (!chatContextType || !contextId) throw new ApiError(400, 'chatContextType and contextId are required');
  const validContextTypes = ['GAME', 'BUG', 'USER', 'GROUP'];
  if (!validContextTypes.includes(chatContextType)) throw new ApiError(400, 'Invalid chatContextType');

  const result = await ChatTranslationPreferenceService.set(userId, chatContextType as ChatContextType, contextId, translateToLanguage ?? null);
  res.json({ success: true, data: { translateToLanguage: result } });
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

export const confirmMessageReceiptBatch = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { messageIds, deliveryMethod } = req.body as { messageIds?: unknown; deliveryMethod?: string };
  const userId = req.userId;

  if (!userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    throw new ApiError(400, 'messageIds must be a non-empty array');
  }

  if (messageIds.length > 200) {
    throw new ApiError(400, 'messageIds must contain at most 200 items');
  }

  if (deliveryMethod !== 'socket' && deliveryMethod !== 'push') {
    throw new ApiError(400, 'deliveryMethod must be socket or push');
  }

  const ids = messageIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) {
    throw new ApiError(400, 'messageIds must contain valid string ids');
  }

  const socketService = (global as any).socketService;
  if (socketService) {
    for (const messageId of ids) {
      if (deliveryMethod === 'socket') {
        socketService.markSocketDelivered(messageId, userId);
      } else {
        socketService.markPushDelivered(messageId, userId);
      }
    }
  }

  res.json({ success: true, data: { processed: ids.length } });
});

export const getMissedMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { contextType, contextId, lastMessageId, chatType } = req.query;
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

  const ct = contextType as ChatContextType;
  const gameChatType =
    ct === 'GAME' && typeof chatType === 'string' ? (chatType as ChatType) : null;

  const messages = await MessageService.getMissedMessages(
    ct,
    contextId as string,
    userId,
    (lastMessageId as string) || undefined,
    gameChatType
  );

  res.json({
    success: true,
    data: messages
  });
});

async function assertChatSyncAccess(contextType: ChatContextType, contextId: string, userId: string) {
  if (contextType === 'GAME') {
    await MessageService.validateGameAccess(contextId, userId);
  } else if (contextType === 'BUG') {
    await MessageService.validateBugAccess(contextId, userId);
  } else if (contextType === 'USER') {
    await MessageService.validateUserChatAccess(contextId, userId);
  } else {
    await MessageService.validateGroupChannelAccess(contextId, userId);
  }
}

export const getChatSyncHead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { contextType, contextId } = req.query;
  if (!userId) throw new ApiError(401, 'Unauthorized');
  if (!contextType || !contextId || typeof contextType !== 'string' || typeof contextId !== 'string') {
    throw new ApiError(400, 'contextType and contextId are required');
  }
  const ct = contextType as ChatContextType;
  if (!['GAME', 'BUG', 'USER', 'GROUP'].includes(contextType)) {
    throw new ApiError(400, 'Invalid contextType');
  }
  await assertChatSyncAccess(ct, contextId, userId);
  const maxSeq = await ChatSyncEventService.getHeadSeq(ct, contextId);
  res.json({ success: true, data: { maxSeq } });
});

/**
 * Event log page after `afterSeq`. When retention prunes old rows, `cursorStale` is true if the client
 * cursor sits before a gap (`afterSeq < oldestRetainedSeq - 1` with `afterSeq > 0`). Client should reset
 * cursor, reload the visible message window, and re-pull. `oldestRetainedSeq` is null if no rows exist.
 */
export const getChatSyncEvents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { contextType, contextId, afterSeq, limit } = req.query;
  if (!userId) throw new ApiError(401, 'Unauthorized');
  if (!contextType || !contextId || typeof contextType !== 'string' || typeof contextId !== 'string') {
    throw new ApiError(400, 'contextType and contextId are required');
  }
  const ct = contextType as ChatContextType;
  if (!['GAME', 'BUG', 'USER', 'GROUP'].includes(contextType)) {
    throw new ApiError(400, 'Invalid contextType');
  }
  await assertChatSyncAccess(ct, contextId, userId);
  const after = Math.max(0, Number(afterSeq ?? 0) || 0);
  const lim = Math.min(500, Math.max(1, Number(limit ?? 200) || 200));
  const oldestRetainedSeq = await ChatSyncEventService.getOldestRetainedSeq(ct, contextId);
  const cursorStale =
    after > 0 && oldestRetainedSeq != null && after < oldestRetainedSeq - 1;
  const events = await ChatSyncEventService.getEventsAfter(ct, contextId, after, lim);
  res.json({
    success: true,
    data: {
      events,
      hasMore: events.length === lim,
      oldestRetainedSeq,
      cursorStale,
    },
  });
});

const SYNC_BATCH_HEAD_MAX = 120;

export const postChatSyncBatchHead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'Unauthorized');
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, 'items must be a non-empty array');
  }
  if (items.length > SYNC_BATCH_HEAD_MAX) {
    throw new ApiError(400, `items must contain at most ${SYNC_BATCH_HEAD_MAX} entries`);
  }
  const normalized: Array<{ contextType: ChatContextType; contextId: string }> = [];
  for (const raw of items) {
    if (!raw || typeof raw.contextType !== 'string' || typeof raw.contextId !== 'string') {
      throw new ApiError(400, 'Each item needs contextType and contextId');
    }
    if (!['GAME', 'BUG', 'USER', 'GROUP'].includes(raw.contextType)) {
      throw new ApiError(400, 'Invalid contextType in items');
    }
    normalized.push({ contextType: raw.contextType as ChatContextType, contextId: raw.contextId });
  }
  for (const it of normalized) {
    await assertChatSyncAccess(it.contextType, it.contextId, userId);
  }
  const heads = await ChatSyncEventService.getHeadsForContexts(normalized);
  res.json({ success: true, data: heads });
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
    let notifyUserIds: string[] | undefined;
    if (contextType === 'USER') {
      const peers = await prisma.userChat.findUnique({
        where: { id: contextId },
        select: { user1Id: true, user2Id: true },
      });
      if (peers) {
        notifyUserIds = [peers.user1Id, peers.user2Id].filter((id): id is string => typeof id === 'string' && id.length > 0);
      }
    }
    socketService.emitChatEvent(
      contextType as ChatContextType,
      contextId,
      'read-receipt',
      {
        readReceipt: {
          userId,
          readAt: new Date().toISOString(),
          allRead: result.count > 0,
        },
      },
      undefined,
      result.syncSeq,
      notifyUserIds
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

  try {
    const ctx = chatContextType as ChatContextType;
    const cid = contextId as string;
    if (ctx === 'GAME') await MessageService.validateGameAccess(cid, userId);
    else if (ctx === 'USER') await MessageService.validateUserChatAccess(cid, userId);
    else if (ctx === 'GROUP') await MessageService.validateGroupChannelAccess(cid, userId);
    else if (ctx === 'BUG') await MessageService.validateBugAccess(cid, userId);
  } catch {
    throw new ApiError(403, 'Access denied to this context');
  }

  const hasContent = typeof content === 'string' && content.trim().length > 0;
  const hasMentions = mentionIds.length > 0;
  if (!hasContent && !hasMentions) {
    await DraftService.deleteDraft(
      userId,
      chatContextType as ChatContextType,
      contextId,
      chatType as ChatType
    );
    return res.json({ success: true, data: null });
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

  try {
    const ctx = chatContextType as ChatContextType;
    const cid = contextId as string;
    if (ctx === 'GAME') {
      await MessageService.validateGameAccess(cid, userId);
    } else if (ctx === 'USER') {
      await MessageService.validateUserChatAccess(cid, userId);
    } else if (ctx === 'GROUP') {
      await MessageService.validateGroupChannelAccess(cid, userId);
    } else if (ctx === 'BUG') {
      await MessageService.validateBugAccess(cid, userId);
    }
  } catch (err) {
    console.warn('getDraft access denied', { userId, chatContextType, contextId, err });
    return res.json({ success: true, data: null });
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
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit as string) || 100));

  const result = await DraftService.getUserDrafts(userId, page, limit);

  res.json({
    success: true,
    data: result.drafts,
    pagination: result.pagination
  });
});

export const searchMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.userId;
  const { q, section, messagesPage = 1, messagesLimit = 20, gamePage = 1, gameLimit = 20, bugsPage = 1, channelPage = 1, channelLimit = 20, marketPage = 1, marketLimit = 20 } = req.query;
  if (!userId) throw new ApiError(401, 'Unauthorized');
  const result = await MessageSearchService.search(userId, String(q).trim(), {
    section: section as 'messages' | 'games' | 'channels' | 'bugs' | 'market' | undefined,
    messagesPage: Number(messagesPage),
    messagesLimit: Number(messagesLimit),
    gamePage: Number(gamePage),
    gameLimit: Number(gameLimit),
    bugsPage: Number(bugsPage),
    channelPage: Number(channelPage),
    channelLimit: Number(channelLimit),
    marketPage: Number(marketPage),
    marketLimit: Number(marketLimit)
  });
  res.json({
    success: true,
    messages: result.messages,
    gameMessages: result.gameMessages,
    channelMessages: result.channelMessages,
    bugMessages: result.bugMessages,
    marketMessages: result.marketMessages,
    messagesPagination: result.messagesPagination,
    gamePagination: result.gamePagination,
    channelPagination: result.channelPagination,
    bugsPagination: result.bugsPagination,
    marketPagination: result.marketPagination
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
