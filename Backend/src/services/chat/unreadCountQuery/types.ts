import type { ContextKey, GroupChannelMeta, UnreadTotals } from '../unreadSnapshot.service';

export type UnreadSnapshotShape = 'counts' | 'objects';

export type UnreadTotalsResult = {
  total: number;
  userUnreadRevision: number;
};

export type CountsByContextResult = {
  byContext: Record<ContextKey, number>;
  groupChannelMeta: Record<string, GroupChannelMeta>;
};

export type SlimUnreadSnapshotDto = {
  version: number;
  clock: { userUnreadRevision: number };
  contextRevisions?: Record<ContextKey, number>;
  byContext: Record<ContextKey, number>;
  totals: UnreadTotals;
  mutedGroupIds: string[];
  groupChannelMeta: Record<string, GroupChannelMeta>;
  games: [];
  userChats: [];
  bugs: [];
  groupChannels: [];
  marketItems: [];
};
