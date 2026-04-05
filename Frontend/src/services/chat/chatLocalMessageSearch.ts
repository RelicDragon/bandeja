import type { ChatMessage, GroupChannel, SearchMessageResult } from '@/api/chat';
import { chatLocalDb, type ChatListFilterTab, type ChatLocalRow } from './chatLocalDb';
import { normalizeChatLocalSearchQuery } from './chatLocalMessageSearchText';
import { tokenizeForSearchIndex } from './chatLocalMessageSearchTokens';

const SCAN_CAP = 480;
const MAX_TOKEN_CANDIDATE_IDS = 6000;
const BULK_GET_CHUNK = 300;
const GLOBAL_MATCH_MAX = 1200;

export type LocalSearchSectionKey =
  | 'messages'
  | 'gameMessages'
  | 'channelMessages'
  | 'bugMessages'
  | 'marketMessages';

export type LocalSearchOptions = {
  sectionLimit?: number;
  sectionOffset?: Partial<Record<LocalSearchSectionKey, number>>;
};

export type LocalSearchBuckets = {
  messages: SearchMessageResult[];
  gameMessages: SearchMessageResult[];
  channelMessages: SearchMessageResult[];
  bugMessages: SearchMessageResult[];
  marketMessages: SearchMessageResult[];
  hasMoreLocal: Record<LocalSearchSectionKey, boolean>;
};

function groupChannelStubFromThreadJson(
  itemJson: string
): { id: string; isChannel: boolean; marketItemId?: string | null } | null {
  try {
    const o = JSON.parse(itemJson) as { item?: { data?: GroupChannel } };
    const d = o?.item?.data;
    if (!d?.id) return null;
    return { id: d.id, isChannel: !!d.isChannel, marketItemId: d.marketItemId };
  } catch {
    return null;
  }
}

function toLocalSearchHit(
  m: ChatMessage,
  groupStub?: { id: string; isChannel: boolean; marketItemId?: string | null }
): SearchMessageResult {
  if (m.chatContextType === 'GROUP' && groupStub) {
    return {
      message: m,
      context: {
        id: groupStub.id,
        name: '',
        isChannel: groupStub.isChannel,
        isPublic: false,
        participantsCount: 0,
        createdAt: '',
        updatedAt: '',
        marketItemId: groupStub.marketItemId,
      } as GroupChannel,
      fromLocalCache: true,
    };
  }
  return {
    message: m,
    context: { id: m.contextId } as SearchMessageResult['context'],
    fromLocalCache: true,
  };
}

function bucketGroupFromListFilters(f: Set<ChatListFilterTab>): LocalSearchSectionKey {
  if (f.has('market')) return 'marketMessages';
  if (f.has('bugs')) return 'bugMessages';
  if (f.has('channels')) return 'channelMessages';
  return 'messages';
}

async function loadGroupThreadMetaByContextIds(contextIds: string[]): Promise<
  Map<
    string,
    {
      stub: { id: string; isChannel: boolean; marketItemId?: string | null } | null;
      filters: Set<ChatListFilterTab>;
    }
  >
> {
  const map = new Map<
    string,
    {
      stub: { id: string; isChannel: boolean; marketItemId?: string | null } | null;
      filters: Set<ChatListFilterTab>;
    }
  >();
  for (const gid of contextIds) {
    const trows = await chatLocalDb.threadIndex
      .where('[contextType+contextId]')
      .equals(['GROUP', gid])
      .toArray();
    const filters = new Set(trows.map((r) => r.listFilter));
    let stub: { id: string; isChannel: boolean; marketItemId?: string | null } | null = null;
    for (const tr of trows) {
      stub = groupChannelStubFromThreadJson(tr.itemJson);
      if (stub) break;
    }
    map.set(gid, { stub, filters });
  }
  return map;
}

function sectionKeyForMessageSync(
  m: ChatMessage,
  groupMeta?: { filters: Set<ChatListFilterTab> }
): LocalSearchSectionKey {
  if (m.chatContextType === 'GAME') return 'gameMessages';
  if (m.chatContextType === 'BUG') return 'bugMessages';
  if (m.chatContextType === 'GROUP') {
    return bucketGroupFromListFilters(groupMeta?.filters ?? new Set());
  }
  return 'messages';
}

async function messageIdsFromTokenIndex(tokens: string[]): Promise<Set<string> | null> {
  if (tokens.length === 0) return null;
  const ordered = [...tokens].sort((a, b) => b.length - a.length);
  let acc: Set<string> | null = null;
  for (const t of ordered) {
    const rows = await chatLocalDb.messageSearchTokens.where('token').equals(t).toArray();
    const next = new Set(rows.map((r) => r.messageId));
    if (acc === null) acc = next;
    else {
      for (const id of acc) {
        if (!next.has(id)) acc.delete(id);
      }
    }
    if (acc.size === 0) return acc;
  }
  return acc;
}

type CollectMatchMeta = {
  candidatesTruncated: boolean;
  matchesTruncated: boolean;
  scanCapped: boolean;
};

async function collectMatchingLocalRows(needle: string): Promise<{
  rows: ChatLocalRow[];
  meta: CollectMatchMeta;
}> {
  const qTokens = tokenizeForSearchIndex(needle);
  const fromIdx = await messageIdsFromTokenIndex(qTokens);
  if (fromIdx != null && fromIdx.size > 0) {
    let ids = [...fromIdx];
    const candidatesTruncated = ids.length > MAX_TOKEN_CANDIDATE_IDS;
    if (candidatesTruncated) {
      ids.sort((a, b) => b.localeCompare(a));
      ids = ids.slice(0, MAX_TOKEN_CANDIDATE_IDS);
    }
    const byId = new Map<string, ChatLocalRow>();
    for (let i = 0; i < ids.length; i += BULK_GET_CHUNK) {
      const slice = ids.slice(i, i + BULK_GET_CHUNK);
      const batch = await chatLocalDb.messages.bulkGet(slice);
      for (const r of batch) {
        if (!r || r.deletedAt || !r.searchText || !r.searchText.includes(needle)) continue;
        byId.set(r.id, r);
      }
    }
    const sorted = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
    const matchesTruncated = sorted.length > GLOBAL_MATCH_MAX;
    const rows = matchesTruncated ? sorted.slice(0, GLOBAL_MATCH_MAX) : sorted;
    return {
      rows,
      meta: { candidatesTruncated, matchesTruncated, scanCapped: false },
    };
  }
  const scanned = await chatLocalDb.messages
    .filter((r) => !r.deletedAt && !!r.searchText && r.searchText.includes(needle))
    .limit(SCAN_CAP)
    .toArray();
  const scanCapped = scanned.length >= SCAN_CAP;
  return {
    rows: scanned,
    meta: { candidatesTruncated: false, matchesTruncated: false, scanCapped },
  };
}

function emptyBuckets(): Omit<LocalSearchBuckets, 'hasMoreLocal'> {
  return {
    messages: [],
    gameMessages: [],
    channelMessages: [],
    bugMessages: [],
    marketMessages: [],
  };
}

export async function searchLocalCachedMessageResults(
  query: string,
  options?: LocalSearchOptions
): Promise<LocalSearchBuckets> {
  const sectionLimit = options?.sectionLimit ?? 60;
  const sectionOffset = options?.sectionOffset ?? {};

  const empty: LocalSearchBuckets = {
    ...emptyBuckets(),
    hasMoreLocal: {
      messages: false,
      gameMessages: false,
      channelMessages: false,
      bugMessages: false,
      marketMessages: false,
    },
  };

  const needle = normalizeChatLocalSearchQuery(query);
  if (!needle || needle.length < 2) return empty;

  const { rows: collected, meta: collectMeta } = await collectMatchingLocalRows(needle);
  const rows = collected;
  rows.sort((a, b) => b.createdAt - a.createdAt);

  const groupIds = [
    ...new Set(rows.filter((r) => r.payload.chatContextType === 'GROUP').map((r) => r.payload.contextId)),
  ];
  const groupMetaById = await loadGroupThreadMetaByContextIds(groupIds);

  const raw: Record<LocalSearchSectionKey, SearchMessageResult[]> = {
    messages: [],
    gameMessages: [],
    channelMessages: [],
    bugMessages: [],
    marketMessages: [],
  };

  for (const row of rows) {
    const p = row.payload;
    const gmeta = p.chatContextType === 'GROUP' ? groupMetaById.get(p.contextId) : undefined;
    const hit = toLocalSearchHit(p, gmeta?.stub ?? undefined);
    const key = sectionKeyForMessageSync(p, gmeta);
    raw[key].push(hit);
  }

  const hasMoreLocal = { ...empty.hasMoreLocal };
  const incompletePool =
    collectMeta.candidatesTruncated || collectMeta.matchesTruncated || collectMeta.scanCapped;
  const sliceSection = (key: LocalSearchSectionKey, list: SearchMessageResult[]) => {
    const off = sectionOffset[key] ?? 0;
    const lim = sectionLimit;
    hasMoreLocal[key] =
      list.length > off + lim || (incompletePool && list.length > 0);
    return list.slice(off, off + lim);
  };

  return {
    messages: sliceSection('messages', raw.messages),
    gameMessages: sliceSection('gameMessages', raw.gameMessages),
    channelMessages: sliceSection('channelMessages', raw.channelMessages),
    bugMessages: sliceSection('bugMessages', raw.bugMessages),
    marketMessages: sliceSection('marketMessages', raw.marketMessages),
    hasMoreLocal,
  };
}

export function mergeSearchSection(api: SearchMessageResult[], local: SearchMessageResult[]): SearchMessageResult[] {
  const seen = new Set(api.map((x) => x.message.id));
  const extra = local.filter((x) => !seen.has(x.message.id));
  return [...api, ...extra];
}
