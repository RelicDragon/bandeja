import prisma from '../../config/database';
import { ChatContextType } from '@prisma/client';
import { subMonths } from 'date-fns';
import { ChatReadCursorService, type ReadCursorMessageSlice } from './chatReadCursor.service';
import { appendReadCursorUpdatesInTransaction } from './readCursorSync';
import {
  type AutoReadAffectedContext,
  dedupeAutoReadAffected,
} from './unreadAutoReadNotify.service';

const CUTOFF_MONTHS = 1;
const MESSAGE_BATCH = 500;

function cutoffDate(): Date {
  return subMonths(new Date(), CUTOFF_MONTHS);
}

export type MarkOldUnreadAsReadResult = {
  affected: AutoReadAffectedContext[];
};

export class UnreadAutoReadService {
  static async markOldUnreadAsRead(): Promise<MarkOldUnreadAsReadResult> {
    const cutoff = cutoffDate();
    const affected: AutoReadAffectedContext[] = [];

    const trackAffected = (
      chatContextType: ChatContextType,
      contextId: string,
      userIds: Iterable<string>,
      senderId: string | null
    ): void => {
      if (!senderId) return;
      for (const userId of userIds) {
        if (userId === senderId) continue;
        affected.push({ userId, chatContextType, contextId });
      }
    };

    const contextTypes: ChatContextType[] = ['GAME', 'USER', 'GROUP', 'BUG'];
    for (const chatContextType of contextTypes) {
      let cursor: string | undefined;
      do {
        const messages = await prisma.chatMessage.findMany({
          where: {
            chatContextType,
            createdAt: { lt: cutoff },
            senderId: { not: null },
            deletedAt: null,
          },
          select: {
            id: true,
            contextId: true,
            senderId: true,
            chatType: true,
            serverSyncSeq: true,
            createdAt: true,
          },
          take: MESSAGE_BATCH,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        });
        if (messages.length === 0) break;

        const contextIds = [...new Set(messages.map((m) => m.contextId))];
        const recipientByContext = await this.getRecipientUserIdsByContext(
          chatContextType,
          contextIds
        );

        for (const msg of messages) {
          const recipients = recipientByContext.get(msg.contextId);
          if (!recipients) continue;
          trackAffected(chatContextType, msg.contextId, recipients, msg.senderId);
        }

        await this.mergeReadCursorsForOldMessages(
          chatContextType,
          messages,
          recipientByContext
        );

        cursor = messages.length === MESSAGE_BATCH ? messages[messages.length - 1]!.id : undefined;
      } while (cursor);
    }

    return {
      affected: dedupeAutoReadAffected(affected),
    };
  }

  private static async getRecipientUserIdsByContext(
    chatContextType: ChatContextType,
    contextIds: string[]
  ): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    if (contextIds.length === 0) return map;

    if (chatContextType === 'GAME') {
      const participants = await prisma.gameParticipant.findMany({
        where: { gameId: { in: contextIds } },
        select: { gameId: true, userId: true },
      });
      for (const p of participants) {
        let set = map.get(p.gameId);
        if (!set) {
          set = new Set();
          map.set(p.gameId, set);
        }
        set.add(p.userId);
      }
      return map;
    }

    if (chatContextType === 'USER') {
      const chats = await prisma.userChat.findMany({
        where: { id: { in: contextIds } },
        select: { id: true, user1Id: true, user2Id: true },
      });
      for (const c of chats) {
        const set = new Set<string>([c.user1Id, c.user2Id]);
        map.set(c.id, set);
      }
      return map;
    }

    if (chatContextType === 'GROUP') {
      const participants = await prisma.groupChannelParticipant.findMany({
        where: { groupChannelId: { in: contextIds }, hidden: false },
        select: { groupChannelId: true, userId: true },
      });
      for (const p of participants) {
        let set = map.get(p.groupChannelId);
        if (!set) {
          set = new Set();
          map.set(p.groupChannelId, set);
        }
        set.add(p.userId);
      }
      return map;
    }

    if (chatContextType === 'BUG') {
      const bugs = await prisma.bug.findMany({
        where: { id: { in: contextIds } },
        select: { id: true, senderId: true },
      });
      const bugParticipants = await prisma.bugParticipant.findMany({
        where: { bugId: { in: contextIds } },
        select: { bugId: true, userId: true },
      });
      for (const b of bugs) {
        const set = new Set<string>([b.senderId]);
        map.set(b.id, set);
      }
      for (const p of bugParticipants) {
        const set = map.get(p.bugId);
        if (set) set.add(p.userId);
      }
      return map;
    }

    return map;
  }

  private static async mergeReadCursorsForOldMessages(
    chatContextType: ChatContextType,
    messages: Array<{
      id: string;
      contextId: string;
      senderId: string | null;
      chatType: ReadCursorMessageSlice['chatType'];
      serverSyncSeq: number | null;
      createdAt: Date;
    }>,
    recipientByContext: Map<string, Set<string>>
  ): Promise<void> {
    const byUser = new Map<string, ReadCursorMessageSlice[]>();
    for (const msg of messages) {
      const recipients = recipientByContext.get(msg.contextId);
      if (!recipients || !msg.senderId) continue;
      const cursorSlice: ReadCursorMessageSlice = {
        id: msg.id,
        chatContextType,
        contextId: msg.contextId,
        chatType: msg.chatType,
        serverSyncSeq: msg.serverSyncSeq,
        createdAt: msg.createdAt,
      };
      for (const uid of recipients) {
        if (uid === msg.senderId) continue;
        const rows = byUser.get(uid);
        if (rows) rows.push(cursorSlice);
        else byUser.set(uid, [cursorSlice]);
      }
    }
    if (byUser.size === 0) return;

    await prisma.$transaction(
      async (tx) => {
        for (const [userId, rows] of byUser) {
          const results = await ChatReadCursorService.mergeFromMessages(tx, userId, rows);
          await appendReadCursorUpdatesInTransaction(tx, results);
        }
      },
      { timeout: 120_000 }
    );
  }
}
