import { ChatContextType, ChatType, ParticipantRole, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { hasParentGamePermissionWithUserCheck } from '../../utils/parentGamePermissions';
import { ChatMuteService } from './chatMute.service';
import { sqlMessageNotReadByUser } from './chatReadUnreadSql';
import { MessageService } from './message.service';
import { ReadReceiptService } from './readReceipt.service';
import { UnreadCountBatchService } from './unreadCountBatch.service';
import { UnreadObjectsService, type UnreadObjectsResult } from './unreadObjects.service';

export type SnapshotContextType = 'GAME' | 'USER' | 'GROUP';
export type ContextKey = `${SnapshotContextType}:${string}`;

export type UnreadTotals = {
  all: number;
  games: number;
  userChats: number;
  bugs: number;
  groups: number;
  channels: number;
  marketplace: number;
  myGames: number;
  pastGames: number;
};

export type GroupChannelMeta = {
  isChannel?: boolean;
  marketItemId?: string | null;
  bugId?: string | null;
  buyerId?: string | null;
  sellerId?: string | null;
};

export type UnreadSnapshotDto = UnreadObjectsResult & {
  version: number;
  totals: UnreadTotals;
  byContext: Record<ContextKey, number>;
  /** GROUP channel ids muted by the viewer — client recomputes badge totals on socket deltas. */
  mutedGroupIds: string[];
};

export type MarkContextReadParams = {
  contextType: SnapshotContextType;
  contextId: string;
  gameChatTypes?: ChatType[];
};

export type MarkContextReadResult = {
  markedCount: number;
  unreadCount: 0;
  syncSeq?: number;
};

const EMPTY_TOTALS: UnreadTotals = {
  all: 0,
  games: 0,
  userChats: 0,
  bugs: 0,
  groups: 0,
  channels: 0,
  marketplace: 0,
  myGames: 0,
  pastGames: 0,
};

export function toContextKey(contextType: SnapshotContextType, contextId: string): ContextKey {
  return `${contextType}:${contextId}`;
}

export function buildByContextFromUnreadObjects(objects: UnreadObjectsResult): Record<ContextKey, number> {
  const byContext: Record<ContextKey, number> = {};
  for (const { game, unreadCount } of objects.games) {
    if (game?.id && unreadCount > 0) byContext[toContextKey('GAME', game.id)] = unreadCount;
  }
  for (const { chat, unreadCount } of objects.userChats) {
    if (chat?.id && unreadCount > 0) byContext[toContextKey('USER', chat.id)] = unreadCount;
  }
  for (const { bug, unreadCount } of objects.bugs) {
    const channelId = bug?.groupChannelId as string | undefined;
    if (channelId && unreadCount > 0) byContext[toContextKey('GROUP', channelId)] = unreadCount;
  }
  for (const { groupChannel, unreadCount } of objects.groupChannels) {
    if (groupChannel?.id && unreadCount > 0) {
      byContext[toContextKey('GROUP', groupChannel.id)] = unreadCount;
    }
  }
  for (const { groupChannelId, unreadCount } of objects.marketItems) {
    if (groupChannelId && unreadCount > 0) {
      byContext[toContextKey('GROUP', groupChannelId)] = unreadCount;
    }
  }
  return byContext;
}

export function buildGroupChannelMeta(objects: UnreadObjectsResult): Record<string, GroupChannelMeta> {
  const meta: Record<string, GroupChannelMeta> = {};
  for (const { bug } of objects.bugs) {
    const channelId = bug?.groupChannelId as string | undefined;
    if (channelId) {
      meta[channelId] = { bugId: bug?.id ?? null, isChannel: false, marketItemId: null };
    }
  }
  for (const { groupChannel } of objects.groupChannels) {
    if (groupChannel?.id) {
      meta[groupChannel.id] = {
        isChannel: groupChannel.isChannel ?? false,
        marketItemId: groupChannel.marketItemId ?? null,
        bugId: null,
      };
    }
  }
  for (const { groupChannelId, marketItem, buyerId, sellerId } of objects.marketItems) {
    if (groupChannelId) {
      meta[groupChannelId] = {
        isChannel: false,
        marketItemId: marketItem?.id ?? 'market',
        bugId: null,
        buyerId: buyerId ?? null,
        sellerId: sellerId ?? marketItem?.sellerId ?? null,
      };
    }
  }
  return meta;
}

export function computeTotals(
  byContext: Record<ContextKey, number>,
  meta: { groupChannelMeta: Record<string, GroupChannelMeta>; mutedGroupIds?: Set<string> }
): UnreadTotals {
  let games = 0;
  let userChats = 0;
  let bugs = 0;
  let groups = 0;
  let channels = 0;
  let marketplace = 0;

  for (const [key, count] of Object.entries(byContext) as Array<[ContextKey, number]>) {
    if (count <= 0) continue;
    const colon = key.indexOf(':');
    const type = key.slice(0, colon) as SnapshotContextType;
    const id = key.slice(colon + 1);

    if (type === 'GAME') {
      games += count;
    } else if (type === 'USER') {
      userChats += count;
    } else if (type === 'GROUP') {
      if (meta.mutedGroupIds?.has(id)) continue;
      const channelMeta = meta.groupChannelMeta[id];
      if (channelMeta?.marketItemId) {
        marketplace += count;
      } else if (channelMeta?.bugId) {
        bugs += count;
      } else if (channelMeta?.isChannel === true) {
        channels += count;
      } else {
        groups += count;
      }
    }
  }

  const all = games + userChats + bugs + groups + channels + marketplace;
  return {
    all,
    games,
    userChats,
    bugs,
    groups,
    channels,
    marketplace,
    myGames: 0,
    pastGames: 0,
  };
}

/** @deprecated use computeTotals — kept for tests importing array-based helper */
export function computeUnreadTotals(objects: UnreadObjectsResult): UnreadTotals {
  const byContext = buildByContextFromUnreadObjects(objects);
  const groupChannelMeta = buildGroupChannelMeta(objects);
  return computeTotals(byContext, { groupChannelMeta });
}

export class UnreadSnapshotService {
  private static async getScopedGameTotals(userId: string): Promise<Pick<UnreadTotals, 'myGames' | 'pastGames'>> {
    const unreadContexts = await prisma.$queryRaw<Array<{ contextId: string }>>(
      Prisma.sql`
        SELECT DISTINCT m."contextId"
        FROM "ChatMessage" m
        WHERE m."chatContextType" = 'GAME'::"ChatContextType"
          AND m."deletedAt" IS NULL
          AND m."senderId" IS NOT NULL
          AND m."senderId" <> ${userId}
          AND ${sqlMessageNotReadByUser(userId)}
      `
    );
    const gameIds = unreadContexts.map((row) => row.contextId).filter(Boolean);
    if (gameIds.length === 0) return { myGames: 0, pastGames: 0 };

    const games = await prisma.game.findMany({
      where: {
        id: { in: gameIds },
        participants: { some: { userId } },
      },
      select: {
        id: true,
        status: true,
        startTime: true,
        participants: {
          where: { userId },
          select: { status: true, role: true },
        },
      },
    });
    if (games.length === 0) return { myGames: 0, pastGames: 0 };

    const unreadCounts = await ReadReceiptService.getGamesUnreadCountsFromGames(
      games.map((game) => ({
        id: game.id,
        status: String(game.status),
        participants: game.participants.map((participant) => ({
          status: String(participant.status),
          role: String(participant.role),
        })),
      })),
      userId
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let myGames = 0;
    let pastGames = 0;
    for (const game of games) {
      const count = unreadCounts[game.id] ?? 0;
      if (count <= 0) continue;
      if (game.status === 'ARCHIVED' && game.startTime < today) {
        pastGames += count;
      } else {
        myGames += count;
      }
    }
    return { myGames, pastGames };
  }

  static async getSnapshot(userId: string): Promise<UnreadSnapshotDto> {
    const [objects, mutedChats, scopedGameTotals] = await Promise.all([
      UnreadObjectsService.getUnreadObjects(userId),
      ChatMuteService.getMutedChats(userId, 'GROUP'),
      this.getScopedGameTotals(userId),
    ]);
    const mutedGroupIds = new Set(
      mutedChats.map((m) => m.contextId).filter((id): id is string => typeof id === 'string' && id.length > 0)
    );
    const byContext = buildByContextFromUnreadObjects(objects);
    const totals = computeTotals(byContext, {
      groupChannelMeta: buildGroupChannelMeta(objects),
      mutedGroupIds,
    });
    totals.myGames = scopedGameTotals.myGames;
    totals.pastGames = scopedGameTotals.pastGames;
    return {
      ...objects,
      version: Date.now(),
      totals,
      byContext,
      mutedGroupIds: [...mutedGroupIds],
    };
  }

  static async getTotalsAll(userId: string): Promise<number> {
    const snapshot = await this.getSnapshot(userId);
    return snapshot.totals.all;
  }

  static async markContextRead(
    userId: string,
    params: MarkContextReadParams
  ): Promise<MarkContextReadResult> {
    const { contextType, contextId, gameChatTypes } = params;

    if (contextType === 'GAME' && gameChatTypes?.length) {
      await this.validateGameChatTypesSubset(contextId, userId, gameChatTypes);
    }

    let result: { count: number; syncSeq?: number };
    if (contextType === 'GAME') {
      result = await ReadReceiptService.markAllMessagesAsRead(contextId, userId, gameChatTypes ?? []);
    } else if (contextType === 'USER') {
      result = await ReadReceiptService.markUserChatAsRead(contextId, userId);
    } else {
      result = await ReadReceiptService.markAllMessagesAsReadForContext(
        'GROUP',
        contextId,
        userId,
        undefined
      );
    }

    return {
      markedCount: result.count,
      unreadCount: 0,
      syncSeq: result.syncSeq,
    };
  }

  static async markAllAndSnapshot(userId: string): Promise<UnreadSnapshotDto> {
    const snapshot = await this.getSnapshot(userId);
    const socketService = (global as any).socketService;

    for (const { game } of snapshot.games) {
      if (!game?.id) continue;
      await ReadReceiptService.markAllMessagesAsRead(game.id, userId, []);
      if (socketService) {
        await socketService.emitUnreadCountUpdate('GAME' as ChatContextType, game.id, userId, 0);
      }
    }

    for (const { chat } of snapshot.userChats) {
      if (!chat?.id) continue;
      await ReadReceiptService.markUserChatAsRead(chat.id, userId);
      if (socketService) {
        await socketService.emitUnreadCountUpdate('USER', chat.id, userId, 0);
      }
    }

    const groupChannelIds = new Set<string>();
    for (const { bug } of snapshot.bugs) {
      const id = bug?.groupChannelId as string | undefined;
      if (id) groupChannelIds.add(id);
    }
    for (const { groupChannel } of snapshot.groupChannels) {
      if (groupChannel?.id) groupChannelIds.add(groupChannel.id);
    }
    for (const { groupChannelId } of snapshot.marketItems) {
      if (groupChannelId) groupChannelIds.add(groupChannelId);
    }

    for (const channelId of groupChannelIds) {
      await ReadReceiptService.markAllMessagesAsReadForContext('GROUP', channelId, userId, undefined);
      if (socketService) {
        await socketService.emitUnreadCountUpdate('GROUP', channelId, userId, 0);
      }
    }

    return {
      version: Date.now(),
      totals: { ...EMPTY_TOTALS },
      byContext: {},
      mutedGroupIds: snapshot.mutedGroupIds,
      games: [],
      userChats: [],
      bugs: [],
      groupChannels: [],
      marketItems: [],
    };
  }

  static async validateGameChatTypesSubset(
    gameId: string,
    userId: string,
    clientTypes: ChatType[]
  ): Promise<void> {
    const { participant, game } = await MessageService.validateGameAccess(gameId, userId);
    const isParentGameAdminOrOwner = await hasParentGamePermissionWithUserCheck(
      gameId,
      userId,
      [ParticipantRole.OWNER, ParticipantRole.ADMIN]
    );
    const allowed = new Set(
      UnreadCountBatchService.buildGameChatTypeFilter(participant, game.status, isParentGameAdminOrOwner)
    );
    for (const t of clientTypes) {
      if (!allowed.has(t)) {
        throw new ApiError(400, `Chat type ${t} is not accessible for this game`);
      }
    }
  }
}
