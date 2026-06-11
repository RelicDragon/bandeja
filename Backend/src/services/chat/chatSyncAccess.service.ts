import { ChatContextType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

/**
 * Batched read-access validation for chat sync endpoints.
 * Mirrors the view-level semantics of MessageService.validate*Access
 * (requireWriteAccess = false) but resolves all contexts with a handful
 * of grouped queries instead of per-context round trips.
 */
export class ChatSyncAccessService {
  static async assertBatchAccess(
    items: Array<{ contextType: ChatContextType; contextId: string }>,
    userId: string
  ): Promise<void> {
    const gameIds = new Set<string>();
    const bugIds = new Set<string>();
    const userChatIds = new Set<string>();
    const groupIds = new Set<string>();

    for (const it of items) {
      if (it.contextType === 'GAME') gameIds.add(it.contextId);
      else if (it.contextType === 'BUG') bugIds.add(it.contextId);
      else if (it.contextType === 'USER') userChatIds.add(it.contextId);
      else groupIds.add(it.contextId);
    }

    const tasks: Promise<void>[] = [];

    if (gameIds.size > 0) {
      tasks.push(
        prisma.game
          .findMany({ where: { id: { in: [...gameIds] } }, select: { id: true } })
          .then((rows) => {
            if (rows.length !== gameIds.size) {
              throw new ApiError(404, 'Game not found');
            }
          })
      );
    }

    if (bugIds.size > 0) {
      tasks.push(
        (async () => {
          const [rows, user] = await Promise.all([
            prisma.bug.findMany({ where: { id: { in: [...bugIds] } }, select: { id: true } }),
            prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
          ]);
          if (!user) {
            throw new ApiError(401, 'User not found');
          }
          if (rows.length !== bugIds.size) {
            throw new ApiError(404, 'Bug not found');
          }
        })()
      );
    }

    if (userChatIds.size > 0) {
      tasks.push(
        (async () => {
          const rows = await prisma.userChat.findMany({
            where: { id: { in: [...userChatIds] } },
            select: { id: true, user1Id: true, user2Id: true },
          });
          if (rows.length !== userChatIds.size) {
            throw new ApiError(404, 'Chat not found');
          }
          for (const row of rows) {
            if (row.user1Id !== userId && row.user2Id !== userId) {
              throw new ApiError(403, 'You are not a participant in this chat');
            }
          }
        })()
      );
    }

    if (groupIds.size > 0) {
      tasks.push(
        (async () => {
          const rows = await prisma.groupChannel.findMany({
            where: { id: { in: [...groupIds] } },
            select: {
              id: true,
              isPublic: true,
              participants: { where: { userId }, select: { id: true } },
            },
          });
          if (rows.length !== groupIds.size) {
            throw new ApiError(404, 'Group/Channel not found');
          }
          for (const row of rows) {
            if (!row.isPublic && row.participants.length === 0) {
              throw new ApiError(403, 'You are not a participant in this group/channel');
            }
          }
        })()
      );
    }

    await Promise.all(tasks);
  }
}
