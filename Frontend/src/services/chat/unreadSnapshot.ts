import type { ChatType } from '@/types';
import type { UnreadObjectsApiPayload } from '@/services/chat/chatUnreadPayload';
import type { ChatItem } from '@/utils/chatListSort';
import {
  contextKey as contractContextKey,
  emptyUnreadTotals as contractEmptyUnreadTotals,
  parseContextKey as contractParseContextKey,
  type ContextKey as ContractContextKey,
  type UnreadTotals as ContractUnreadTotals,
} from '@bandeja/unread-contract';

export { computeTotals } from '@bandeja/unread-contract';

export type SnapshotContextType = 'GAME' | 'USER' | 'GROUP';
export type SocketContextType = SnapshotContextType | 'BUG';

export type ContextKey = ContractContextKey;

export type UnreadTotals = ContractUnreadTotals;

export type GroupChannelMeta = {
  isChannel?: boolean;
  marketItemId?: string | null;
  bugId?: string | null;
  buyerId?: string | null;
  sellerId?: string | null;
};

export type UnreadSnapshotDto = UnreadObjectsApiPayload & {
  version?: number;
  totals?: Partial<UnreadTotals>;
  byContext?: Record<ContextKey, number>;
  mutedGroupIds?: string[];
  groupChannelMeta?: Record<string, GroupChannelMeta>;
  clock?: { userUnreadRevision: number };
  contextRevisions?: Record<ContextKey, number>;
};

export type ComputeTotalsMeta = {
  groupChannelMeta: Record<string, GroupChannelMeta>;
  mutedGroupIds: Set<string>;
  myGameIds?: Set<string>;
  pastGameIds?: Set<string>;
};

export type ChatsSubtabFilter = 'users' | 'bugs' | 'channels' | 'market';

export function contextKey(contextType: SnapshotContextType, contextId: string): ContextKey {
  return contractContextKey(contextType, contextId);
}

export function parseContextKey(key: ContextKey): { contextType: SnapshotContextType; contextId: string } | null {
  return contractParseContextKey(key);
}

export function emptyUnreadTotals(): UnreadTotals {
  return contractEmptyUnreadTotals();
}

export function hydrateGroupChannelMetaFromPayload(dto: UnreadSnapshotDto): Record<string, GroupChannelMeta> {
  const meta: Record<string, GroupChannelMeta> = { ...(dto.groupChannelMeta ?? {}) };
  for (const row of dto.groupChannels ?? []) {
    const id = row.groupChannel?.id;
    if (!id) continue;
    meta[id] = {
      ...meta[id],
      isChannel: row.groupChannel.isChannel,
      marketItemId: meta[id]?.marketItemId ?? null,
      bugId: meta[id]?.bugId ?? null,
    };
  }
  for (const row of dto.bugs ?? []) {
    const bug = row.bug;
    const channelId =
      bug && typeof bug === 'object' && bug != null && 'groupChannelId' in bug
        ? (bug as { groupChannelId?: string }).groupChannelId
        : undefined;
    const bugId =
      bug && typeof bug === 'object' && bug != null && 'id' in bug ? (bug as { id?: string }).id : undefined;
    if (channelId) {
      meta[channelId] = { ...meta[channelId], bugId: bugId ?? meta[channelId]?.bugId ?? null, isChannel: true };
    }
  }
  for (const row of dto.marketItems ?? []) {
    const id = row.groupChannelId;
    if (!id) continue;
    const mi =
      row.marketItem && typeof row.marketItem === 'object' && row.marketItem != null
        ? (row.marketItem as { id?: string; sellerId?: string })
        : null;
    const marketItemId = mi?.id ?? 'market';
    const rowBuyer =
      'buyerId' in row && row.buyerId != null ? (row as { buyerId?: string | null }).buyerId : undefined;
    const rowSeller =
      'sellerId' in row && row.sellerId != null ? (row as { sellerId?: string | null }).sellerId : undefined;
    meta[id] = {
      ...meta[id],
      marketItemId: marketItemId ?? meta[id]?.marketItemId ?? 'market',
      isChannel: meta[id]?.isChannel ?? true,
      buyerId: rowBuyer ?? meta[id]?.buyerId ?? null,
      sellerId: rowSeller ?? mi?.sellerId ?? meta[id]?.sellerId ?? null,
    };
  }
  return meta;
}

/** Build sparse byContext from legacy unread-objects arrays (GROUP keys for bugs/market). */
export function byContextFromSnapshotDto(dto: UnreadSnapshotDto): Record<ContextKey, number> {
  if (dto.byContext && Object.keys(dto.byContext).length > 0) {
    return { ...dto.byContext };
  }
  const map: Record<ContextKey, number> = {};
  for (const row of dto.games ?? []) {
    if (row.unreadCount > 0 && row.game?.id) {
      map[contextKey('GAME', row.game.id)] = row.unreadCount;
    }
  }
  for (const row of dto.userChats ?? []) {
    if (row.unreadCount > 0 && row.chat?.id) {
      map[contextKey('USER', row.chat.id)] = row.unreadCount;
    }
  }
  for (const row of dto.groupChannels ?? []) {
    if (row.unreadCount > 0 && row.groupChannel?.id) {
      map[contextKey('GROUP', row.groupChannel.id)] = row.unreadCount;
    }
  }
  for (const row of dto.bugs ?? []) {
    if (row.unreadCount <= 0) continue;
    const bug = row.bug;
    const channelId =
      bug && typeof bug === 'object' && bug != null && 'groupChannelId' in bug
        ? (bug as { groupChannelId?: string }).groupChannelId
        : undefined;
    if (channelId) {
      const key = contextKey('GROUP', channelId);
      map[key] = (map[key] ?? 0) + row.unreadCount;
    }
  }
  for (const row of dto.marketItems ?? []) {
    if (row.unreadCount > 0 && row.groupChannelId) {
      const key = contextKey('GROUP', row.groupChannelId);
      map[key] = (map[key] ?? 0) + row.unreadCount;
    }
  }
  return map;
}

/** bugId → group channel id from snapshot payload meta (sync lookup only). */
export function bugChannelIdFromMeta(
  bugId: string,
  groupChannelMeta: Record<string, GroupChannelMeta>
): string | null {
  for (const [channelId, gm] of Object.entries(groupChannelMeta)) {
    if (gm.bugId === bugId) return channelId;
  }
  return null;
}

export function hydrateBugMetaFromGroupChannels(
  channels: ReadonlyArray<{ id: string; bugId?: string | null; bug?: { id?: string } | null }>
): Record<string, GroupChannelMeta> {
  const groupChannelMeta: Record<string, GroupChannelMeta> = {};
  for (const ch of channels) {
    const bugId = ch.bugId ?? ch.bug?.id;
    if (!bugId) continue;
    groupChannelMeta[ch.id] = {
      bugId,
      isChannel: true,
      marketItemId: groupChannelMeta[ch.id]?.marketItemId ?? null,
    };
  }
  return groupChannelMeta;
}

export function computeScopedGameTotals(
  byContext: Record<ContextKey, number>,
  myGameIds: Set<string>,
  pastGameIds: Set<string>
): Pick<UnreadTotals, 'myGames' | 'pastGames'> {
  let myGames = 0;
  let pastGames = 0;
  for (const id of myGameIds) {
    myGames += byContext[contextKey('GAME', id)] ?? 0;
  }
  for (const id of pastGameIds) {
    pastGames += byContext[contextKey('GAME', id)] ?? 0;
  }
  return { myGames, pastGames };
}

export function applyScopedGameTotals(
  totals: UnreadTotals,
  byContext: Record<ContextKey, number>,
  meta: ComputeTotalsMeta
): UnreadTotals {
  if (!meta.myGameIds?.size && !meta.pastGameIds?.size) return totals;
  const scoped = computeScopedGameTotals(
    byContext,
    meta.myGameIds ?? new Set(),
    meta.pastGameIds ?? new Set()
  );
  return { ...totals, ...scoped };
}

/** Prefer server overlay when it reports a positive scoped total; snapshot API sends 0 as placeholder. */
function mergeScopedGameTotal(serverVal: number | undefined, computedVal: number): number {
  return serverVal != null && serverVal > 0 ? serverVal : computedVal;
}

export function mergeServerTotals(
  computed: UnreadTotals,
  server?: Partial<UnreadTotals>
): UnreadTotals {
  if (!server) return computed;
  return {
    all: server.all ?? computed.all,
    games: server.games ?? computed.games,
    userChats: server.userChats ?? computed.userChats,
    bugs: server.bugs ?? computed.bugs,
    groups: server.groups ?? computed.groups,
    channels: server.channels ?? computed.channels,
    marketplace: server.marketplace ?? computed.marketplace,
    myGames: mergeScopedGameTotal(server.myGames, computed.myGames),
    pastGames: mergeScopedGameTotal(server.pastGames, computed.pastGames),
  };
}

export function resolveSocketContextKey(params: {
  contextKey?: ContextKey;
  contextType: SocketContextType;
  contextId: string;
  groupChannelMeta?: Record<string, GroupChannelMeta>;
}): ContextKey | null {
  if (params.contextKey) return params.contextKey;
  if (params.contextType === 'GAME' || params.contextType === 'USER' || params.contextType === 'GROUP') {
    return contextKey(params.contextType, params.contextId);
  }
  if (params.contextType === 'BUG' && params.groupChannelMeta) {
    const channelId = bugChannelIdFromMeta(params.contextId, params.groupChannelMeta);
    if (channelId) return contextKey('GROUP', channelId);
  }
  return null;
}

/** Sum of all Chats-section subtabs (users list includes game rows). */
export function selectBottomTabChatsBadgeFromTotals(t: UnreadTotals): number {
  return (
    selectChatsSubtabBadgeFromTotals('users', t) +
    selectChatsSubtabBadgeFromTotals('market', t) +
    selectChatsSubtabBadgeFromTotals('channels', t) +
    selectChatsSubtabBadgeFromTotals('bugs', t)
  );
}

export function selectChatsSubtabBadgeFromTotals(
  filter: ChatsSubtabFilter,
  t: UnreadTotals
): number {
  switch (filter) {
    case 'users':
      return t.userChats + t.groups + t.games;
    case 'market':
      return t.marketplace;
    case 'channels':
      return t.channels;
    case 'bugs':
      return t.bugs;
    default:
      return 0;
  }
}

export function listItemToContextKey(item: ChatItem): ContextKey | null {
  if (item.type === 'game' && item.data?.id) return contextKey('GAME', item.data.id);
  if (item.type === 'user' && item.data?.id) return contextKey('USER', item.data.id);
  if ((item.type === 'group' || item.type === 'channel') && item.data?.id) {
    return contextKey('GROUP', item.data.id);
  }
  return null;
}

export function sumGameContextUnread(
  byContext: Record<ContextKey, number>,
  gameIds: string[]
): number {
  return gameIds.reduce((sum, id) => sum + (byContext[contextKey('GAME', id)] ?? 0), 0);
}

export function marketBuyerSellerUnreadFromContext(
  byContext: Record<ContextKey, number>,
  meta: Record<string, GroupChannelMeta>,
  currentUserId: string | undefined
): { buyer: number; seller: number } {
  let buyer = 0;
  let seller = 0;
  if (!currentUserId) return { buyer, seller };
  for (const [channelId, gm] of Object.entries(meta)) {
    if (!gm.marketItemId) continue;
    const n = byContext[contextKey('GROUP', channelId)] ?? 0;
    if (n <= 0) continue;
    if (gm.buyerId === currentUserId) buyer += n;
    if (gm.sellerId === currentUserId) seller += n;
  }
  return { buyer, seller };
}

export type UnreadAuthorityClock = {
  userUnreadRevision: number;
  userContextUnreadRevision: number;
};

export type MarkContextReadRequest = {
  contextType: SnapshotContextType;
  contextId: string;
  gameChatTypes?: ChatType[];
  clientOpId?: string;
};

export type MarkContextReadResponse = {
  markedCount: number;
  unreadCount: number;
  syncSeq?: number;
  contextKey: ContextKey;
  clock: UnreadAuthorityClock;
  reason: string;
  clientOpId?: string;
};
