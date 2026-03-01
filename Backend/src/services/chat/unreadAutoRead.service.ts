import prisma from '../../config/database';
import { ChatContextType } from '@prisma/client';
import { subMonths } from 'date-fns';

const CUTOFF_MONTHS = 1;
const MESSAGE_BATCH = 500;
const RECEIPT_BATCH = 1000;
const EXISTING_OR_BATCH = 400;

function cutoffDate(): Date {
  return subMonths(new Date(), CUTOFF_MONTHS);
}

export class UnreadAutoReadService {
  static async markOldUnreadAsRead(): Promise<number> {
    const cutoff = cutoffDate();
    let totalCreated = 0;

    const contextTypes: ChatContextType[] = ['GAME', 'USER', 'GROUP', 'BUG'];
    for (const chatContextType of contextTypes) {
      let cursor: string | undefined;
      do {
        const messages = await prisma.chatMessage.findMany({
          where: {
            chatContextType,
            createdAt: { lt: cutoff },
            senderId: { not: null },
          },
          select: { id: true, contextId: true, senderId: true },
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

        const toCreate: { messageId: string; userId: string }[] = [];
        for (const msg of messages) {
          const recipients = recipientByContext.get(msg.contextId);
          if (!recipients) continue;
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
          }
        }

        cursor = messages.length === MESSAGE_BATCH ? messages[messages.length - 1]!.id : undefined;
      } while (cursor);
    }

    return totalCreated;
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
}
