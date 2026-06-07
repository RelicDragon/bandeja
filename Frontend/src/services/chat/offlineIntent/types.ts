import type { ChatContextType, MessageReaction } from '@/api/chat';
import type { ChatType } from '@/types';
import type { QueuedMessageEnqueue } from '@/services/chatMessageQueueStorage';

export type ChatMarkReadMutationPayload =
  | { target: 'context'; chatTypes?: ChatType[] }
  | { target: 'group_channel' };

export type OfflineSendIntent = {
  kind: 'send';
  queued: QueuedMessageEnqueue;
};

export type OfflineEditIntent = {
  kind: 'edit';
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  content: string;
  mentionIds: string[];
};

export type OfflineDeleteIntent = {
  kind: 'delete';
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
};

export type OfflineReactionAddIntent = {
  kind: 'reaction_add';
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  nextReactions: MessageReaction[];
  emoji: string;
  userId: string;
};

export type OfflineReactionRemoveIntent = {
  kind: 'reaction_remove';
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  nextReactions: MessageReaction[];
  userId: string;
};

export type OfflinePinIntent = {
  kind: 'pin';
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  chatType: ChatType;
};

export type OfflineUnpinIntent = {
  kind: 'unpin';
  contextType: ChatContextType;
  contextId: string;
  messageId: string;
  chatType: ChatType;
};

export type OfflineMarkReadBatchIntent = {
  kind: 'mark_read_batch';
  contextType: ChatContextType;
  contextId: string;
  payload: ChatMarkReadMutationPayload;
};

export type OfflineIntentPayload =
  | OfflineSendIntent
  | OfflineEditIntent
  | OfflineDeleteIntent
  | OfflineReactionAddIntent
  | OfflineReactionRemoveIntent
  | OfflinePinIntent
  | OfflineUnpinIntent
  | OfflineMarkReadBatchIntent;

export type OfflineIntentContext = {
  contextType: ChatContextType;
  contextId: string;
};

export type OfflineIntentStatus = {
  failedSends: number;
  failedMutations: number;
};

export type OfflineIntentSource = 'outbox' | 'mutation';

export type PendingOfflineIntent = {
  source: OfflineIntentSource;
  createdAtMs: number;
  id: string;
  contextType: ChatContextType;
  contextId: string;
};

export type FlushOfflineIntentOptions = {
  /** When false, only resume orphaned `sending` / `queued` outbox rows. */
  includeFailedOutbox?: boolean;
};
