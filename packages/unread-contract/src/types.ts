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

export type ComputeTotalsMeta = {
  groupChannelMeta: Record<string, GroupChannelMeta>;
  mutedGroupIds: Set<string> | readonly string[];
};

export type UnreadAuthorityClock = {
  userUnreadRevision: number;
  userContextUnreadRevision: number;
};

export type UnreadAuthorityReason =
  | 'message_created'
  | 'mark_context_read'
  | 'mark_all_read'
  | 'auto_read'
  | 'message_deleted'
  | 'mute_changed'
  | 'snapshot_repair'
  | 'repair';

export type UnreadAuthorityEnvelope = {
  contextKey: ContextKey;
  contextType: SnapshotContextType;
  contextId: string;
  unreadCount: number;
  clock: UnreadAuthorityClock;
  reason: UnreadAuthorityReason;
  clientOpId?: string;
};

export type UnreadSnapshotClock = {
  userUnreadRevision: number;
};

export type UnreadSnapshot = {
  clock: UnreadSnapshotClock;
  byContext: Record<ContextKey, number>;
  contextRevisions: Record<ContextKey, number>;
  totals: UnreadTotals;
  mutedGroupIds: string[];
};

export type UnreadMergeState = {
  lastAppliedSnapshotRevision: number;
  maxSeenUserUnreadRevision: number;
  baseByContext: Record<ContextKey, number>;
  contextRevisions: Record<ContextKey, number>;
};

export type OptimisticUnreadBump = {
  pendingCount: number;
  messageIds: string[];
};

export type SnapshotApplyOptions = {
  repairRequestedAtMaxSeen?: number;
  interveningDeltaUserRevision?: number | null;
};
