import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { ChatContextType, ChatType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { normalizeChatClientMutationId } from '../../utils/chatClientMutationId';
import { recordPushReplyMetric } from './push-reply-metrics';

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export type PushReplyTokenScope = {
  recipientUserId: string;
  chatContextType: ChatContextType;
  contextId: string;
  messageId: string;
  chatType?: ChatType | null;
};

export type ValidatedPushReplyToken = PushReplyTokenScope & {
  tokenId: string;
  alreadyUsed: boolean;
};

export type ValidatedPushReceiptToken = PushReplyTokenScope & {
  tokenId: string;
};

function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function constantTimeTokenMatch(expectedHash: string, candidatePlaintext: string): boolean {
  const candidateHash = hashToken(candidatePlaintext);
  const a = Buffer.from(expectedHash, 'hex');
  const b = Buffer.from(candidateHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export class PushReplyTokenService {
  static async generate(scope: PushReplyTokenScope): Promise<string> {
    const plaintext = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(plaintext);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await prisma.pushReplyToken.create({
      data: {
        tokenHash,
        recipientUserId: scope.recipientUserId,
        chatContextType: scope.chatContextType,
        contextId: scope.contextId,
        messageId: scope.messageId,
        chatType: scope.chatType ?? null,
        expiresAt,
      },
    });

    return plaintext;
  }

  static async validateForReceipt(replyToken: string): Promise<ValidatedPushReceiptToken> {
    if (!replyToken || typeof replyToken !== 'string' || replyToken.length < 16) {
      recordPushReplyMetric('invalidToken');
      console.log('[push-reply] invalid-receipt-token reason=malformed');
      throw new ApiError(401, 'Invalid reply token', true, { code: 'push.invalidReplyToken' });
    }

    const tokenHash = hashToken(replyToken);
    const row = await prisma.pushReplyToken.findUnique({ where: { tokenHash } });

    if (!row || !constantTimeTokenMatch(row.tokenHash, replyToken)) {
      recordPushReplyMetric('invalidToken');
      console.log('[push-reply] invalid-receipt-token reason=not-found');
      throw new ApiError(401, 'Invalid reply token', true, { code: 'push.invalidReplyToken' });
    }

    if (row.expiresAt.getTime() < Date.now()) {
      recordPushReplyMetric('invalidToken');
      console.log('[push-reply] invalid-receipt-token reason=expired', {
        chatContextType: row.chatContextType,
        recipientUserId: row.recipientUserId,
      });
      throw new ApiError(401, 'Reply token expired', true, { code: 'push.replyTokenExpired' });
    }

    return {
      tokenId: row.id,
      recipientUserId: row.recipientUserId,
      chatContextType: row.chatContextType,
      contextId: row.contextId,
      messageId: row.messageId,
      chatType: row.chatType,
    };
  }

  static async validate(replyToken: string, _clientMutationId?: string | null): Promise<ValidatedPushReplyToken> {
    if (!replyToken || typeof replyToken !== 'string' || replyToken.length < 16) {
      recordPushReplyMetric('invalidToken');
      console.log('[push-reply] invalid-token reason=malformed');
      throw new ApiError(401, 'Invalid reply token', true, { code: 'push.invalidReplyToken' });
    }

    const tokenHash = hashToken(replyToken);
    const row = await prisma.pushReplyToken.findUnique({ where: { tokenHash } });

    if (!row || !constantTimeTokenMatch(row.tokenHash, replyToken)) {
      recordPushReplyMetric('invalidToken');
      console.log('[push-reply] invalid-token reason=not-found');
      throw new ApiError(401, 'Invalid reply token', true, { code: 'push.invalidReplyToken' });
    }

    if (row.expiresAt.getTime() < Date.now()) {
      recordPushReplyMetric('invalidToken');
      console.log('[push-reply] invalid-token reason=expired', {
        chatContextType: row.chatContextType,
        recipientUserId: row.recipientUserId,
      });
      throw new ApiError(401, 'Reply token expired', true, { code: 'push.replyTokenExpired' });
    }

    if (row.usedAt) {
      if (row.resultMessageId) {
        return {
          tokenId: row.id,
          recipientUserId: row.recipientUserId,
          chatContextType: row.chatContextType,
          contextId: row.contextId,
          messageId: row.messageId,
          chatType: row.chatType,
          alreadyUsed: true,
        };
      }
      recordPushReplyMetric('error');
      console.log('[push-reply] invalid-token reason=used-without-result', {
        chatContextType: row.chatContextType,
        recipientUserId: row.recipientUserId,
      });
      throw new ApiError(500, 'Reply idempotency state incomplete');
    }

    return {
      tokenId: row.id,
      recipientUserId: row.recipientUserId,
      chatContextType: row.chatContextType,
      contextId: row.contextId,
      messageId: row.messageId,
      chatType: row.chatType,
      alreadyUsed: false,
    };
  }

  static async markUsed(
    tokenId: string,
    resultMessageId: string,
    clientMutationId?: string | null
  ): Promise<void> {
    await prisma.pushReplyToken.update({
      where: { id: tokenId },
      data: {
        usedAt: new Date(),
        resultMessageId,
        clientMutationId: normalizeChatClientMutationId(clientMutationId) ?? undefined,
      },
    });
  }

  static async getResultMessageId(tokenId: string): Promise<string | null> {
    const row = await prisma.pushReplyToken.findUnique({
      where: { id: tokenId },
      select: { resultMessageId: true },
    });
    return row?.resultMessageId ?? null;
  }

  static async purgeExpired(): Promise<number> {
    const result = await prisma.pushReplyToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
