import type { ChatContextType, ChatType } from '@prisma/client';
import prisma from '../../config/database';

export async function loadActorReadCursorsForSocket(
  userId: string,
  chatContextType: ChatContextType,
  contextId: string,
  chatTypes?: ChatType[]
): Promise<
  Array<{
    userId: string;
    chatContextType: ChatContextType;
    contextId: string;
    chatType: ChatType;
    readMaxServerSyncSeq: number;
    readMaxCreatedAt: string;
    readMaxMessageId: string;
    updatedAt: string;
  }>
> {
  const rows = await prisma.chatReadCursor.findMany({
    where: {
      userId,
      chatContextType,
      contextId,
      ...(chatTypes && chatTypes.length > 0 ? { chatType: { in: chatTypes } } : {}),
    },
  });
  return rows.map((r) => ({
    userId: r.userId,
    chatContextType: r.chatContextType,
    contextId: r.contextId,
    chatType: r.chatType,
    readMaxServerSyncSeq: r.readMaxServerSyncSeq,
    readMaxCreatedAt: r.readMaxCreatedAt.toISOString(),
    readMaxMessageId: r.readMaxMessageId,
    updatedAt: r.updatedAt.toISOString(),
  }));
}
