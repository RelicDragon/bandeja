import prisma from '../../config/database';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { ParticipantRole } from '@prisma/client';
import { ChatMuteService } from './chatMute.service';
import { UnreadCountBatchService } from './unreadCountBatch.service';
import { ReadReceiptService } from './readReceipt.service';

export interface UnreadObjectsResult {
  games: Array<{ game: any; unreadCount: number }>;
  bugs: Array<{ bug: any; unreadCount: number }>;
  userChats: Array<{ chat: any; unreadCount: number }>;
  groupChannels: Array<{ groupChannel: any; unreadCount: number }>;
  marketItems: Array<{ marketItem: any; groupChannelId: string; unreadCount: number }>;
}

const GAME_INCLUDE = {
  participants: {
    include: {
      user: { select: USER_SELECT_FIELDS },
    },
  },
  court: {
    include: {
      club: {
        select: {
          name: true,
          city: { select: { name: true } },
        },
      },
    },
  },
  leagueSeason: {
    include: {
      league: { select: { id: true, name: true } },
      game: { select: { id: true, name: true } },
    },
  },
  leagueGroup: { select: { id: true, name: true, color: true } },
  leagueRound: { select: { id: true, orderIndex: true } },
  parent: {
    include: {
      leagueSeason: {
        include: {
          league: { select: { id: true, name: true } },
          game: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const;


const GAME_COUNT_CONCURRENCY = 30;

async function getGamesWithUnread(userId: string): Promise<UnreadObjectsResult['games']> {
  const minimalGames = await prisma.game.findMany({
    where: { participants: { some: { userId } } },
    select: {
      id: true,
      status: true,
      participants: {
        where: { userId },
        select: { status: true, role: true },
      },
    },
  });

  const counts: Array<{ gameId: string; count: number }> = [];
  for (let i = 0; i < minimalGames.length; i += GAME_COUNT_CONCURRENCY) {
    const batch = minimalGames.slice(i, i + GAME_COUNT_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (g) => {
        const participant = g.participants[0];
        const chatTypeFilter = UnreadCountBatchService.buildGameChatTypeFilter(
          participant,
          g.status
        );
        const count = await UnreadCountBatchService.getGameUnreadCount(
          g.id,
          userId,
          chatTypeFilter
        );
        return { gameId: g.id, count };
      })
    );
    counts.push(...batchResults);
  }

  const gameIdsWithUnread = counts.filter((c) => c.count > 0).map((c) => c.gameId);

  if (gameIdsWithUnread.length === 0) return [];

  const fullGames = await prisma.game.findMany({
    where: { id: { in: gameIdsWithUnread } },
    include: GAME_INCLUDE,
  });

  const countMap = Object.fromEntries(counts.map((c) => [c.gameId, c.count]));
  const gameById = Object.fromEntries(fullGames.map((g) => [g.id, g]));
  return gameIdsWithUnread.map((id) => ({
    game: gameById[id],
    unreadCount: countMap[id] ?? 0,
  }));
}

async function getUserChatsWithUnread(userId: string): Promise<UnreadObjectsResult['userChats']> {
  const chats = await prisma.userChat.findMany({
    where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    select: { id: true },
  });

  if (chats.length === 0) return [];

  const contextIds = chats.map((c) => c.id);
  const unreadMap = await UnreadCountBatchService.getUnreadCountsByContext(
    'USER',
    contextIds,
    userId
  );

  const chatIdsWithUnread = Object.entries(unreadMap)
    .filter(([, count]) => count > 0)
    .map(([id]) => id);

  if (chatIdsWithUnread.length === 0) return [];

  const fullChats = await prisma.userChat.findMany({
    where: { id: { in: chatIdsWithUnread } },
    include: {
      user1: { select: USER_SELECT_FIELDS },
      user2: { select: USER_SELECT_FIELDS },
    },
  });

  const chatById = Object.fromEntries(fullChats.map((c) => [c.id, c]));
  return chatIdsWithUnread.map((id) => ({
    chat: chatById[id],
    unreadCount: unreadMap[id] ?? 0,
  }));
}

async function getBugsWithUnread(userId: string): Promise<UnreadObjectsResult['bugs']> {
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
  if (channelIds.length === 0) return [];

  const unreadMap = await ReadReceiptService.getGroupChannelsUnreadCounts(channelIds, userId);

  const idsWithUnread = Object.entries(unreadMap)
    .filter(([, count]) => count > 0)
    .map(([id]) => id);

  if (idsWithUnread.length === 0) return [];

  const fullChannels = await prisma.groupChannel.findMany({
    where: { id: { in: idsWithUnread } },
    include: {
      bug: {
        include: {
          sender: { select: { ...USER_SELECT_FIELDS, isAdmin: true } },
        },
      },
      participants: {
        where: { userId },
        include: { user: { select: USER_SELECT_FIELDS } },
      },
    },
  });

  const channelById = Object.fromEntries(fullChannels.map((c) => [c.id, c]));
  return idsWithUnread.map((id) => {
    const channel = channelById[id]!;
    return {
      bug: channel.bug ? { ...channel.bug, groupChannelId: channel.id } : null,
      unreadCount: unreadMap[id] ?? 0,
    };
  });
}

async function getGroupChannelsWithUnread(
  userId: string
): Promise<UnreadObjectsResult['groupChannels']> {
  const [channels, mutedChats] = await Promise.all([
    prisma.groupChannel.findMany({
      where: {
        bugId: null,
        marketItemId: null,
        participants: { some: { userId, hidden: false } },
      },
      select: { id: true },
    }),
    ChatMuteService.getMutedChats(userId, 'GROUP'),
  ]);

  const mutedSet = new Set(mutedChats.map((m) => m.contextId));
  const contextIds = channels.map((c) => c.id).filter((id) => !mutedSet.has(id));

  if (contextIds.length === 0) return [];

  const unreadMap = await UnreadCountBatchService.getUnreadCountsByContext(
    'GROUP',
    contextIds,
    userId
  );

  const channelIdsWithUnread = Object.entries(unreadMap)
    .filter(([, count]) => count > 0)
    .map(([id]) => id);

  if (channelIdsWithUnread.length === 0) return [];

  const fullChannels = await prisma.groupChannel.findMany({
    where: { id: { in: channelIdsWithUnread } },
    include: {
      participants: {
        where: { userId },
        include: { user: { select: USER_SELECT_FIELDS } },
      },
    },
  });

  const channelById = Object.fromEntries(fullChannels.map((c) => [c.id, c]));
  return channelIdsWithUnread.map((id) => {
    const channel = channelById[id]!;
    const userParticipant = (channel.participants as any[]).find(
      (p: any) => p.userId === userId
    );
    return {
      groupChannel: {
        ...channel,
        isParticipant: !!userParticipant,
        isOwner: userParticipant?.role === ParticipantRole.OWNER,
      },
      unreadCount: unreadMap[id] ?? 0,
    };
  });
}

async function getMarketItemChannelsWithUnread(
  userId: string
): Promise<UnreadObjectsResult['marketItems']> {
  const [channels, mutedChats] = await Promise.all([
    prisma.groupChannel.findMany({
      where: {
        marketItemId: { not: null },
        participants: { some: { userId, hidden: false } },
      },
      select: { id: true, marketItemId: true },
    }),
    ChatMuteService.getMutedChats(userId, 'GROUP'),
  ]);

  const mutedSet = new Set(mutedChats.map((m) => m.contextId));
  const contextIds = channels.map((c) => c.id).filter((id) => !mutedSet.has(id));
  if (contextIds.length === 0) return [];

  const unreadMap = await UnreadCountBatchService.getUnreadCountsByContext(
    'GROUP',
    contextIds,
    userId
  );

  const channelIdsWithUnread = Object.entries(unreadMap)
    .filter(([, count]) => count > 0)
    .map(([id]) => id);

  if (channelIdsWithUnread.length === 0) return [];

  const fullChannels = await prisma.groupChannel.findMany({
    where: { id: { in: channelIdsWithUnread } },
    include: {
      marketItem: {
        select: { id: true, title: true, mediaUrls: true },
      },
    },
  });

  const channelById = Object.fromEntries(fullChannels.map((c) => [c.id, c]));
  return channelIdsWithUnread
    .map((id) => {
      const channel = channelById[id]!;
      return {
        marketItem: channel.marketItem,
        groupChannelId: channel.id,
        unreadCount: unreadMap[id] ?? 0,
      };
    })
    .filter((entry) => entry.marketItem != null);
}

export class UnreadObjectsService {
  static async getUnreadObjects(userId: string): Promise<UnreadObjectsResult> {
    const [games, userChats, bugs, groupChannels, marketItems] = await Promise.all([
      getGamesWithUnread(userId),
      getUserChatsWithUnread(userId),
      getBugsWithUnread(userId),
      getGroupChannelsWithUnread(userId),
      getMarketItemChannelsWithUnread(userId),
    ]);

    return { games, bugs, userChats, groupChannels, marketItems };
  }
}
