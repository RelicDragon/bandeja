import prisma from '../../config/database';
import { ChatSyncEventType } from '@bandeja/chat-contract';
import { ChatContextType } from '@prisma/client';
import { subMonths } from 'date-fns';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { ChatReadCursorService, type ReadCursorMessageSlice } from './chatReadCursor.service';
import {
  type AutoReadAffectedContext,
  dedupeAutoReadAffected,
} from './unreadAutoReadNotify.service';

const CUTOFF_MONTHS = 1;
const MESSAGE_BATCH = 500;
const RECEIPT_BATCH = 1000;
const EXISTING_OR_BATCH = 400;
const READ_SYNC_CHUNK = 400;

function cutoffDate(): Date {
  return subMonths(new Date(), CUTOFF_MONTHS);
}

export type MarkOldUnreadAsReadResult = {
  totalCreated: number;
  affected: AutoReadAffectedContext[];
};

export class UnreadAutoReadService {
  static async markOldUnreadAsRead(): Promise<MarkOldUnreadAsReadResult> {
    const cutoff = cutoffDate();
    let totalCreated = 0;
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

        const messageIdToContextId = new Map<string, string>();
        for (const m of messages) {
          messageIdToContextId.set(m.id, m.contextId);
        }

        const toCreate: { messageId: string; userId: string }[] = [];
        for (const msg of messages) {
          const recipients = recipientByContext.get(msg.contextId);
          if (!recipients) continue;
          trackAffected(chatContextType, msg.contextId, recipients, msg.senderId);
          const senderId = msg.senderId!;
          for (const uid of recipients) {
            if (uid !== senderId) toCreate.push({ messageId: msg.id, userId: uid });
          }
        }

        if (toCreate.length > 0) {
          const existingSet = new Set<string>();
          for (let o = 0; o < toCreate.length; o += EXISTING_OR_BATCH) {
            const slice = toCreate.slice(o, o + EXISTING_OR_BATCH);
            const existing = await prisma.messageReadReceipt.findMany({
              where: {
                OR: slice.map(({ messageId, userId }) => ({ messageId, userId })),
              },
              select: { messageId: true, userId: true },
            });
            for (const r of existing) existingSet.add(`${r.messageId}:${r.userId}`);
          }
          const filtered = toCreate.filter(
            (p) => !existingSet.has(`${p.messageId}:${p.userId}`)
          );

          const readAtIso = cutoff.toISOString();
          for (let i = 0; i < filtered.length; i += RECEIPT_BATCH) {
            const batch = filtered.slice(i, i + RECEIPT_BATCH);
            const readAt = cutoff;
            await prisma.messageReadReceipt.createMany({
              data: batch.map(({ messageId, userId }) => ({
                messageId,
                userId,
                readAt,
              })),
              skipDuplicates: true,
            });
            totalCreated += batch.length;
            await this.appendReadBatchSyncEvents(
              chatContextType,
              batch,
              messageIdToContextId,
              readAtIso
            );
          }
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
      totalCreated,
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
          await ChatReadCursorService.mergeFromMessages(tx, userId, rows);
        }
      },
      { timeout: 120_000 }
    );
  }

  private static async appendReadBatchSyncEvents(
    chatContextType: ChatContextType,
    batch: { messageId: string; userId: string }[],
    messageIdToContextId: Map<string, string>,
    readAtIso: string
  ): Promise<void> {
    const byKey = new Map<string, { contextId: string; userId: string; messageIds: string[] }>();
    for (const { messageId, userId } of batch) {
      const contextId = messageIdToContextId.get(messageId);
      if (!contextId) continue;
      const key = `${contextId}\0${userId}`;
      let g = byKey.get(key);
      if (!g) {
        g = { contextId, userId, messageIds: [] };
        byKey.set(key, g);
      }
      g.messageIds.push(messageId);
    }
    for (const g of byKey.values()) {
      for (let j = 0; j < g.messageIds.length; j += READ_SYNC_CHUNK) {
        const slice = g.messageIds.slice(j, j + READ_SYNC_CHUNK);
        await ChatSyncEventService.appendEvent(
          chatContextType,
          g.contextId,
          ChatSyncEventType.MESSAGES_READ_BATCH,
          { userId: g.userId, readAt: readAtIso, messageIds: slice }
        );
      }
    }
  }
}
