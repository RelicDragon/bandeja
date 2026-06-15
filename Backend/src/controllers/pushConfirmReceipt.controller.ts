import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { PushReplyTokenService } from '../services/push/pushReplyToken.service';
import { getChatNotifier } from '../services/chat/chatNotifier';
import { assertPushReplyRateLimit } from '../services/push/pushReply.rateLimit';

export const pushConfirmReceipt = asyncHandler(async (req: Request, res: Response) => {
  const { replyToken } = req.body as { replyToken?: string };

  if (!replyToken || typeof replyToken !== 'string') {
    throw new ApiError(400, 'replyToken is required');
  }

  const scope = await PushReplyTokenService.validateForReceipt(replyToken);
  assertPushReplyRateLimit(scope.recipientUserId);
  getChatNotifier().markPushDelivered(scope.messageId, scope.recipientUserId);

  console.log('[push-reply] receipt-confirmed', {
    chatContextType: scope.chatContextType,
    recipientUserId: scope.recipientUserId,
    messageId: scope.messageId,
  });

  res.json({ success: true });
});
