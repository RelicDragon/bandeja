import { ChatType, ParticipantRole } from '@prisma/client';
import { computeTotals } from '@bandeja/unread-contract';
import { ApiError } from '../../utils/ApiError';
import { hasParentGamePermissionWithUserCheck } from '../../utils/parentGamePermissions';
import { MessageService } from './message.service';
import { ReadReceiptService } from './readReceipt.service';
import { UnreadCountBatchService } from './unreadCountBatch.service';
import { UnreadCountQuery } from './unreadCountQuery';
import type { UnreadObjectsResult } from './unreadObjects.service';
import { UnreadAuthority } from './unreadAuthority';
import { MarkAllReadService, type MarkAllReadContext } from './unreadAuthority/markAllRead.service';
import type { UnreadAuthorityClock, UnreadChangeReason } from './unreadAuthority/types';

export { computeTotals } from '@bandeja/unread-contract';

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
  /** Minimal GROUP meta for totals classification (slim `shape=counts` snapshot). */
  groupChannelMeta?: Record<string, GroupChannelMeta>;
  clock?: { userUnreadRevision: number };
  contextRevisions?: Record<ContextKey, number>;
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
  contextKey: ContextKey;
  clock: UnreadAuthorityClock;
  reason: UnreadChangeReason;
  clientOpId?: string;
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

/** @deprecated use computeTotals from @bandeja/unread-contract — kept for array-based tests */
export function computeUnreadTotals(objects: UnreadObjectsResult): UnreadTotals {
  const byContext = buildByContextFromUnreadObjects(objects);
  const groupChannelMeta = buildGroupChannelMeta(objects);
  return computeTotals(byContext, { groupChannelMeta, mutedGroupIds: new Set() });
}

export class UnreadSnapshotService {
  static async getSnapshot(
    userId: string,
    shape: 'counts' | 'objects' = 'counts'
  ): Promise<UnreadSnapshotDto> {
    return UnreadCountQuery.getSnapshot(userId, shape) as Promise<UnreadSnapshotDto>;
  }

  static async getTotalsAll(userId: string): Promise<number> {
    const result = await UnreadCountQuery.getTotals(userId);
    return result.total;
  }

  static async getTotalsWithRevision(userId: string): Promise<{ total: number; userUnreadRevision: number }> {
    return UnreadCountQuery.getTotals(userId);
  }

  static async markContextRead(
    userId: string,
    params: MarkContextReadParams & { clientOpId?: string; emitSocket?: boolean }
  ): Promise<MarkContextReadResult> {
    const { contextType, contextId, gameChatTypes, clientOpId, emitSocket } = params;

    if (contextType === 'GAME' && gameChatTypes?.length) {
      await this.validateGameChatTypesSubset(contextId, userId, gameChatTypes);
    }

    let markedCount = 0;
    let syncSeq: number | undefined;

    const envelope = await UnreadAuthority.recordContextChanged({
      userId,
      contextKey: toContextKey(contextType, contextId),
      contextType,
      contextId,
      reason: 'mark_context_read',
      clientOpId,
      emitSocket: emitSocket ?? true,
      performReadWrite: async () => {
        let result: { count: number; syncSeq?: number };
        if (contextType === 'GAME') {
          result = await ReadReceiptService.markAllMessagesAsRead(
            contextId,
            userId,
            gameChatTypes ?? []
          );
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
        markedCount = result.count;
        syncSeq = result.syncSeq;
      },
    });

    return {
      markedCount,
      unreadCount: 0,
      syncSeq,
      contextKey: envelope.contextKey,
      clock: envelope.clock,
      reason: envelope.reason,
      ...(envelope.clientOpId ? { clientOpId: envelope.clientOpId } : {}),
    };
  }

  static async markAllAndSnapshot(userId: string): Promise<UnreadSnapshotDto> {
    const snapshot = await this.getSnapshot(userId);
    const contexts: MarkAllReadContext[] = [];

    for (const [contextKey, count] of Object.entries(snapshot.byContext) as Array<[ContextKey, number]>) {
      if (count <= 0) continue;
      const colon = contextKey.indexOf(':');
      const contextType = contextKey.slice(0, colon) as SnapshotContextType;
      const contextId = contextKey.slice(colon + 1);
      if (!contextId) continue;
      contexts.push({ contextKey, contextType, contextId });
    }

    const markAllResult = await MarkAllReadService.recordMarkAllRead({
      userId,
      contexts,
      performMarkRead: async (ctx) => {
        if (ctx.contextType === 'GAME') {
          await ReadReceiptService.markAllMessagesAsRead(ctx.contextId, userId, []);
        } else if (ctx.contextType === 'USER') {
          await ReadReceiptService.markUserChatAsRead(ctx.contextId, userId);
        } else {
          await ReadReceiptService.markAllMessagesAsReadForContext(
            'GROUP',
            ctx.contextId,
            userId,
            undefined
          );
        }
      },
    });

    return {
      version: markAllResult.userUnreadRevision,
      clock: { userUnreadRevision: markAllResult.userUnreadRevision },
      contextRevisions: markAllResult.contextRevisions,
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
