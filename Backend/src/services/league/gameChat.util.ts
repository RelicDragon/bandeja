import { ChatContextType, MessageType, Prisma } from '@prisma/client';

export function isSystemChatMessageContent(content: string | null | undefined): boolean {
  if (!content?.trim()) return false;
  const text = content.trim();
  if (!text.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(text) as { type?: unknown; variables?: unknown };
    return (
      typeof parsed.type === 'string' &&
      parsed.variables != null &&
      typeof parsed.variables === 'object'
    );
  } catch {
    return false;
  }
}

function addIds(result: Set<string>, rows: { contextId: string; gameId: string | null }[]) {
  for (const row of rows) {
    result.add(row.contextId);
    if (row.gameId) result.add(row.gameId);
  }
}

/** Game IDs that have at least one non-system chat message (any game chat type). */
export async function findGameIdsWithNonSystemChat(
  gameIds: string[],
  tx: Prisma.TransactionClient
): Promise<Set<string>> {
  if (gameIds.length === 0) return new Set();

  const result = new Set<string>();

  const withSender = await tx.chatMessage.findMany({
    where: {
      chatContextType: ChatContextType.GAME,
      deletedAt: null,
      senderId: { not: null },
      OR: [{ contextId: { in: gameIds } }, { gameId: { in: gameIds } }],
    },
    select: { contextId: true, gameId: true },
    distinct: ['contextId'],
  });
  addIds(result, withSender);

  const remainingIds = gameIds.filter((id) => !result.has(id));
  if (remainingIds.length === 0) return result;

  const nonTextUserLike = await tx.chatMessage.findMany({
    where: {
      chatContextType: ChatContextType.GAME,
      deletedAt: null,
      OR: [{ contextId: { in: remainingIds } }, { gameId: { in: remainingIds } }],
      AND: [
        {
          OR: [
            { pollId: { not: null } },
            { messageType: { in: [MessageType.VOICE, MessageType.VIDEO, MessageType.IMAGE] } },
            { mediaUrls: { isEmpty: false } },
          ],
        },
      ],
    },
    select: { contextId: true, gameId: true },
    distinct: ['contextId'],
  });
  addIds(result, nonTextUserLike);

  const stillRemaining = remainingIds.filter((id) => !result.has(id));
  if (stillRemaining.length === 0) return result;

  const nullSenderText = await tx.chatMessage.findMany({
    where: {
      chatContextType: ChatContextType.GAME,
      deletedAt: null,
      senderId: null,
      messageType: MessageType.TEXT,
      OR: [{ contextId: { in: stillRemaining } }, { gameId: { in: stillRemaining } }],
    },
    select: { contextId: true, gameId: true, content: true },
  });

  for (const m of nullSenderText) {
    if (!isSystemChatMessageContent(m.content)) {
      addIds(result, [m]);
    }
  }

  return result;
}
