import { parseContextKey } from './contextKey';
import type { ComputeTotalsMeta, ContextKey, UnreadTotals } from './types';

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

function groupChannelIsChannel(meta: ComputeTotalsMeta['groupChannelMeta'][string] | undefined): boolean {
  return !!meta?.isChannel;
}

function mutedGroupIdsHas(meta: ComputeTotalsMeta, groupId: string): boolean {
  const muted = meta.mutedGroupIds;
  if (muted instanceof Set) return muted.has(groupId);
  return muted.includes(groupId);
}

export function emptyUnreadTotals(): UnreadTotals {
  return { ...EMPTY_TOTALS };
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
      if (mutedGroupIdsHas(meta, parsed.contextId)) continue;
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
