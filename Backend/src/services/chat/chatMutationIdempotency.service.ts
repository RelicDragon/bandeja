import prisma from '../../config/database';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { normalizeChatClientMutationId } from '../../utils/chatClientMutationId';

const IN_FLIGHT_STALE_MS = 25_000;
const MAX_BEGIN_SPIN = 8;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export type ChatMutationIdemBegin =
  | { outcome: 'skip'; cid: null }
  | { outcome: 'cached'; body: unknown }
  | { outcome: 'lease'; cid: string }
  | { outcome: 'conflict' };

export class ChatMutationIdempotencyService {
  static normalizeId(raw: unknown): string | null {
    return normalizeChatClientMutationId(raw);
  }

  static async begin(
    userId: string,
    rawCid: unknown,
    kind: string,
    messageId: string,
    payloadHash: string | null
  ): Promise<ChatMutationIdemBegin> {
    const cid = normalizeChatClientMutationId(rawCid);
    if (!cid) return { outcome: 'skip', cid: null };

    for (let spin = 0; spin < MAX_BEGIN_SPIN; spin += 1) {
      const existing = await prisma.chatMutationIdempotency.findUnique({
        where: { userId_clientMutationId: { userId, clientMutationId: cid } },
      });
      if (existing) {
        if (existing.kind !== kind || existing.messageId !== messageId) {
          throw new ApiError(409, 'clientMutationId already used for another operation');
        }
        if (
          payloadHash != null &&
          existing.payloadHash != null &&
          existing.payloadHash !== payloadHash
        ) {
          throw new ApiError(409, 'clientMutationId does not match this request');
        }
        if (existing.responseJson != null) {
          return { outcome: 'cached', body: existing.responseJson };
        }
        const age = Date.now() - existing.createdAt.getTime();
        if (age < IN_FLIGHT_STALE_MS) {
          return { outcome: 'conflict' };
        }
        await prisma.chatMutationIdempotency.delete({ where: { id: existing.id } });
        continue;
      }
      try {
        await prisma.chatMutationIdempotency.create({
          data: {
            userId,
            clientMutationId: cid,
            kind,
            messageId,
            payloadHash,
          },
        });
        return { outcome: 'lease', cid };
      } catch (e) {
        if (isUniqueViolation(e)) continue;
        throw e;
      }
    }
    return { outcome: 'conflict' };
  }

  static async complete(userId: string, clientMutationId: string, responseBody: unknown): Promise<void> {
    await prisma.chatMutationIdempotency.update({
      where: { userId_clientMutationId: { userId, clientMutationId } },
      data: { responseJson: responseBody as Prisma.InputJsonValue },
    });
  }

  static async abort(userId: string, clientMutationId: string): Promise<void> {
    await prisma.chatMutationIdempotency.deleteMany({ where: { userId, clientMutationId } });
  }

  static async purgeOlderThanDays(days: number): Promise<number> {
    if (!(days > 0)) return 0;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const r = await prisma.chatMutationIdempotency.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return r.count;
  }
}
