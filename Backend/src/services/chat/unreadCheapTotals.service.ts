import prisma from '../../config/database';
import { ChatMuteService } from './chatMute.service';
import { ReadReceiptService } from './readReceipt.service';
import { UnreadCountBatchService } from './unreadCountBatch.service';

const GAME_COUNT_CONCURRENCY = 30;

function sumUnreadMap(map: Record<string, number>, excludeIds?: Set<string>): number {
  let total = 0;
  for (const [id, count] of Object.entries(map)) {
    if (count <= 0) continue;
    if (excludeIds?.has(id)) continue;
    total += count;
  }
  return total;
}

async function sumUserChatUnread(userId: string): Promise<number> {
  const chats = await prisma.userChat.findMany({
    where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    select: { id: true },
  });
  if (chats.length === 0) return 0;
  const unreadMap = await UnreadCountBatchService.getUnreadCountsByContext(
    'USER',
    chats.map((c) => c.id),
    userId
  );
  return sumUnreadMap(unreadMap);
}

async function sumBugUnread(userId: string, mutedGroupIds: Set<string>): Promise<number> {
  const groupChannels = await prisma.groupChannel.findMany({
    where: {
      isChannel: false,
      bugId: { not: null },
      bug: { status: { not: 'ARCHIVED' } },
      OR: [
        { participants: { some: { userId, hidden: false } } },
        { isPublic: true },
      ],
    },
    select: { id: true },
  });
  const channelIds = groupChannels.map((c) => c.id);
  if (channelIds.length === 0) return 0;
  const unreadMap = await ReadReceiptService.getGroupChannelsUnreadCounts(channelIds, userId);
  return sumUnreadMap(unreadMap, mutedGroupIds);
}

async function sumRegularGroupUnread(userId: string, mutedGroupIds: Set<string>): Promise<number> {
  const channels = await prisma.groupChannel.findMany({
    where: {
      bugId: null,
      marketItemId: null,
      participants: { some: { userId, hidden: false } },
    },
    select: { id: true },
  });
  if (channels.length === 0) return 0;
  const unreadMap = await UnreadCountBatchService.getUnreadCountsByContext(
    'GROUP',
    channels.map((c) => c.id),
    userId
  );
  return sumUnreadMap(unreadMap, mutedGroupIds);
}

async function sumMarketUnread(userId: string, mutedGroupIds: Set<string>): Promise<number> {
  const channels = await prisma.groupChannel.findMany({
    where: {
      marketItemId: { not: null },
      participants: { some: { userId, hidden: false } },
    },
    select: { id: true },
  });
  if (channels.length === 0) return 0;
  const unreadMap = await UnreadCountBatchService.getUnreadCountsByContext(
    'GROUP',
    channels.map((c) => c.id),
    userId
  );
  return sumUnreadMap(unreadMap, mutedGroupIds);
}

async function sumGameUnread(userId: string): Promise<number> {
  const minimalGames = await prisma.game.findMany({
    where: { status: { not: 'ARCHIVED' }, participants: { some: { userId } } },
    select: {
      id: true,
      status: true,
      participants: {
        where: { userId },
        select: { status: true, role: true },
      },
    },
  });
  if (minimalGames.length === 0) return 0;

  let total = 0;
  for (let i = 0; i < minimalGames.length; i += GAME_COUNT_CONCURRENCY) {
    const batch = minimalGames.slice(i, i + GAME_COUNT_CONCURRENCY);
    const counts = await Promise.all(
      batch.map(async (game) => {
        const participant = game.participants[0];
        const chatTypeFilter = await UnreadCountBatchService.resolveGameChatTypeFilterForUser(
          game.id,
          userId,
          participant,
          game.status
        );
        return UnreadCountBatchService.getGameUnreadCount(game.id, userId, chatTypeFilter);
      })
    );
    for (const count of counts) {
      if (count > 0) total += count;
    }
  }
  return total;
}

export class UnreadCheapTotalsService {
  /** Batched context counts only — no game/chat object hydration (Phase 0 push badge interim). */
  static async getTotalsAll(userId: string): Promise<number> {
    const mutedChats = await ChatMuteService.getMutedChats(userId, 'GROUP');
    const mutedGroupIds = new Set(
      mutedChats
        .map((m) => m.contextId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );

    const [userChats, bugs, groups, marketplace, games] = await Promise.all([
      sumUserChatUnread(userId),
      sumBugUnread(userId, mutedGroupIds),
      sumRegularGroupUnread(userId, mutedGroupIds),
      sumMarketUnread(userId, mutedGroupIds),
      sumGameUnread(userId),
    ]);

    return userChats + bugs + groups + marketplace + games;
  }
}
