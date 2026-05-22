import type { ChatType } from '@/types';
import type { UnreadObjectsApiPayload } from '@/services/chat/chatUnreadPayload';
import type { ChatItem } from '@/utils/chatListSort';

export type SnapshotContextType = 'GAME' | 'USER' | 'GROUP';
export type SocketContextType = SnapshotContextType | 'BUG';

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

export type UnreadSnapshotDto = UnreadObjectsApiPayload & {
  version?: number;
  totals?: Partial<UnreadTotals>;
  byContext?: Record<ContextKey, number>;
};

export type ComputeTotalsMeta = {
  groupChannelMeta: Record<string, GroupChannelMeta>;
  mutedGroupIds: Set<string>;
};

export type ChatsSubtabFilter = 'users' | 'bugs' | 'channels' | 'market';

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

export function contextKey(contextType: SnapshotContextType, contextId: string): ContextKey {
  return `${contextType}:${contextId}`;
}

export function parseContextKey(key: ContextKey): { contextType: SnapshotContextType; contextId: string } | null {
  const i = key.indexOf(':');
  if (i <= 0) return null;
  const contextType = key.slice(0, i) as SnapshotContextType;
  if (contextType !== 'GAME' && contextType !== 'USER' && contextType !== 'GROUP') return null;
  return { contextType, contextId: key.slice(i + 1) };
}

export function emptyUnreadTotals(): UnreadTotals {
  return { ...EMPTY_TOTALS };
}

function groupChannelIsChannel(meta: GroupChannelMeta | undefined): boolean {
  return !!meta?.isChannel;
}

export function hydrateGroupChannelMetaFromPayload(dto: UnreadSnapshotDto): Record<string, GroupChannelMeta> {
  const meta: Record<string, GroupChannelMeta> = {};
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

export function computeTotals(
  byContext: Record<ContextKey, number>,
  meta: ComputeTotalsMeta
): UnreadTotals {
  let games = 0;
  let userChats = 0;
  let bugs = 0;
  let groups = 0;
  let channels = 0;
  let marketplace = 0;

  for (const [key, count] of Object.entries(byContext)) {
    if (count <= 0) continue;
    const parsed = parseContextKey(key as ContextKey);
    if (!parsed) continue;

    if (parsed.contextType === 'GAME') {
      games += count;
      continue;
    }
    if (parsed.contextType === 'USER') {
      userChats += count;
      continue;
    }
    if (parsed.contextType === 'GROUP') {
      if (meta.mutedGroupIds.has(parsed.contextId)) continue;
      const gm = meta.groupChannelMeta[parsed.contextId];
      if (gm?.marketItemId) {
        marketplace += count;
      } else if (gm?.bugId) {
        bugs += count;
      } else if (groupChannelIsChannel(gm)) {
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
    myGames: server.myGames ?? computed.myGames,
    pastGames: server.pastGames ?? computed.pastGames,
  };
}

export function normalizeSocketContextToKey(
  contextType: SocketContextType,
  contextId: string,
  groupChannelMeta: Record<string, GroupChannelMeta>
): ContextKey | null {
  if (contextType === 'GAME' || contextType === 'USER') {
    return contextKey(contextType, contextId);
  }
  if (contextType === 'GROUP') {
    return contextKey('GROUP', contextId);
  }
  if (contextType === 'BUG') {
    for (const [channelId, gm] of Object.entries(groupChannelMeta)) {
      if (gm.bugId === contextId) return contextKey('GROUP', channelId);
    }
    return null;
  }
  return null;
}

export function selectBottomTabChatsBadgeFromTotals(t: UnreadTotals): number {
  return t.userChats + t.groups + t.games + t.bugs + t.channels + t.marketplace;
}

export function selectChatsSubtabBadgeFromTotals(
  filter: ChatsSubtabFilter,
  t: UnreadTotals
): number {
  switch (filter) {
    case 'users':
      return t.userChats + t.groups;
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

export type MarkContextReadRequest = {
  contextType: SnapshotContextType;
  contextId: string;
  gameChatTypes?: ChatType[];
};

export type MarkContextReadResponse = {
  markedCount: number;
  unreadCount: number;
  syncSeq?: number;
};
