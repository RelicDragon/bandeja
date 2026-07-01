import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { MessageService } from '../services/chat/message.service';
import { ChatType } from '@prisma/client';
import { PushReplyTokenService } from '../services/push/pushReplyToken.service';
import { recordPushReplyMetric } from '../services/push/push-reply-metrics';
import { assertPushReplyRateLimit } from '../services/push/pushReply.rateLimit';
import { markReplyContextAsRead } from '../services/telegram/markReplyContextAsRead';
import { getChatNotifier } from '../services/chat/chatNotifier';
import { UnreadCheapTotalsService } from '../services/chat/unreadCheapTotals.service';
import prisma from '../config/database';

const PUSH_REPLY_MAX_CONTENT = 4096;

export const pushReply = asyncHandler(async (req: Request, res: Response) => {
  const { replyToken, content, clientMutationId } = req.body as {
    replyToken?: string;
    content?: string;
    clientMutationId?: string;
  };

  if (!replyToken || typeof replyToken !== 'string') {
    recordPushReplyMetric('invalidToken');
    throw new ApiError(400, 'replyToken is required');
  }

  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) {
    throw new ApiError(400, 'content is required');
  }
  if (trimmed.length > PUSH_REPLY_MAX_CONTENT) {
    throw new ApiError(400, `content must be at most ${PUSH_REPLY_MAX_CONTENT} characters`);
  }

  const scope = await PushReplyTokenService.validate(replyToken, clientMutationId);
  assertPushReplyRateLimit(scope.recipientUserId);

  if (scope.alreadyUsed) {
    const existingId = await PushReplyTokenService.getResultMessageId(scope.tokenId);
    if (!existingId) {
      recordPushReplyMetric('error');
      throw new ApiError(500, 'Reply idempotency state incomplete');
    }
    const message = await prisma.chatMessage.findUnique({ where: { id: existingId } });
    getChatNotifier().markPushDelivered(scope.messageId, scope.recipientUserId);
    recordPushReplyMetric('success');
    console.log('[push-reply] success idempotent', {
      chatContextType: scope.chatContextType,
      recipientUserId: scope.recipientUserId,
    });
    const unreadBadgeCount = (await UnreadCheapTotalsService.getTotalsWithRevision(scope.recipientUserId)).total;
    res.status(200).json({ success: true, data: message, unreadBadgeCount });
    return;
  }

  try {
    const message = await MessageService.createMessageWithEvent({
      chatContextType: scope.chatContextType,
      contextId: scope.contextId,
      senderId: scope.recipientUserId,
      content: trimmed,
      mediaUrls: [],
      replyToId: scope.messageId,
      chatType: (scope.chatType ?? ChatType.PUBLIC) as ChatType,
      clientMutationId: typeof clientMutationId === 'string' ? clientMutationId.trim() : undefined,
    });

    await PushReplyTokenService.markUsed(scope.tokenId, message.id, clientMutationId);

    await markReplyContextAsRead({
      userId: scope.recipientUserId,
      chatContextType: scope.chatContextType,
      contextId: scope.contextId,
      chatType: (scope.chatType ?? ChatType.PUBLIC) as ChatType,
    });

    getChatNotifier().markPushDelivered(scope.messageId, scope.recipientUserId);

    const deduped = !!(message as { _deduped?: boolean })._deduped;
    delete (message as { _deduped?: boolean })._deduped;

    recordPushReplyMetric('success');
    console.log('[push-reply] success', {
      chatContextType: scope.chatContextType,
      recipientUserId: scope.recipientUserId,
      messageId: message.id,
    });

    const unreadBadgeCount = (await UnreadCheapTotalsService.getTotalsWithRevision(scope.recipientUserId)).total;
    res.status(deduped ? 200 : 201).json({ success: true, data: message, unreadBadgeCount });
  } catch (error: unknown) {
    const statusCode =
      error && typeof error === 'object' && 'statusCode' in error
        ? Number((error as { statusCode: number }).statusCode)
        : 500;
    if (statusCode === 403) {
      recordPushReplyMetric('forbidden');
      console.log('[push-reply] forbidden', {
        chatContextType: scope.chatContextType,
        recipientUserId: scope.recipientUserId,
      });
    } else if (statusCode === 429) {
      recordPushReplyMetric('rateLimited');
      console.log('[push-reply] rate-limited', {
        chatContextType: scope.chatContextType,
        recipientUserId: scope.recipientUserId,
      });
    } else {
      recordPushReplyMetric('error');
      console.log('[push-reply] error', {
        chatContextType: scope.chatContextType,
        recipientUserId: scope.recipientUserId,
        statusCode,
      });
    }
    throw error;
  }
});
