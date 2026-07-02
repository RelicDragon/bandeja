import type { ChatContextType, Prisma } from '@prisma/client';
import type { ContextKey, GroupChannelMeta, SnapshotContextType } from '../unreadSnapshot.service';

export type UnreadChangeReason =
  | 'message_created'
  | 'mark_context_read'
  | 'mark_all_read'
  | 'auto_read'
  | 'message_deleted'
  | 'mute_changed'
  | 'snapshot_repair'
  | 'repair';

export type UnreadAuthorityClock = {
  userUnreadRevision: number;
  userContextUnreadRevision: number;
};

export type UnreadAuthorityEnvelope = {
  contextKey: ContextKey;
  contextType: SnapshotContextType;
  contextId: string;
  unreadCount: number;
  clock: UnreadAuthorityClock;
  reason: UnreadChangeReason;
  clientOpId?: string;
  lastMessage?: Record<string, unknown>;
  groupChannelMeta?: Partial<GroupChannelMeta>;
};

export type UnreadCountAdapter = (
  contextType: SnapshotContextType,
  contextId: string,
  userId: string
) => Promise<number>;

export type RecordContextChangedParams = {
  userId: string;
  contextKey: ContextKey;
  contextType: SnapshotContextType;
  contextId: string;
  reason: UnreadChangeReason;
  clientOpId?: string;
  performReadWrite?: (tx: Prisma.TransactionClient) => Promise<void>;
  countAdapter?: UnreadCountAdapter;
  lastMessage?: Record<string, unknown>;
  groupChannelMeta?: Partial<GroupChannelMeta>;
  /** When false, envelope is returned without socket emit (callers that batch emit). */
  emitSocket?: boolean;
};

export type BumpUnreadRevisionsParams = {
  userId: string;
  contextKey: string;
  contextType: ChatContextType;
  contextId: string;
};
