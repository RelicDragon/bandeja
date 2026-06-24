/**
 * Thread Live Projection — Phase 1
 *
 * Pure synchronous reducer for live thread state while a chat is open.
 * Sibling to `applyThreadEvent` (Dexie durability) — this powers React state
 * while the thread is visible, effects run async after paint.
 *
 * See ADR-007 for architectural decisions.
 *
 * @module
 */

import type {
  ChatMessage,
  ChatMessageWithStatus,
  MessageReadReceipt,
  MessageReaction,
  ChatContextType,
} from '@/api/chat';
import { mergeChatMessagesAscending } from '@/utils/chatMessageSort';
import { mergeReadReceipts } from './mergeReadReceipts';
import { readReceiptsFingerprint } from './readReceiptsFingerprint';
import {
  applyAllReadToOwnVisibleMessages,
  applySyncReadBatchToMessages,
} from './chatSyncReadBatchReact';

/**
 * Configuration for a live thread projection.
 * Provides context-specific behavior for the reducer.
 */
export interface ThreadLiveConfig {
  /** Thread context type (GAME/USER/GROUP/BUG) */
  readonly contextType: ChatContextType;
  /** Thread context identifier (gameId, userId, etc.) */
  readonly contextId: string;
  /** Current viewer's user ID — used for filtering own messages, etc. */
  readonly viewerUserId: string;
  /** For GAME chats, whether to filter by chatType (PUBLIC/TEAM) */
  readonly gameChatTypeFilter?: 'PUBLIC' | 'TEAM';
}

/**
 * Live event domain model for open thread projection.
 *
 * These are UI-seam events, not raw sync patches. They represent
 * domain operations that can affect thread state while open.
 *
 * Event flow:
 * - Socket messages → adapter → inboundMessage event
 * - Sync events → adapter → readBatch / readReceipt / etc.
 * - Optimistic send → inboundMessage (with _status)
 */
export type ThreadLiveEvent =
  | InboundMessageEvent
  | ReadBatchEvent
  | ReadReceiptEvent
  | AllReadEvent
  | MessageUpdatedEvent
  | MessageDeletedEvent
  | ReactionEvent;

/**
 * New message arriving while thread is open (socket inbound / optimistic).
 */
export interface InboundMessageEvent {
  readonly type: 'inboundMessage';
  /** Message to merge into thread */
  readonly message: ChatMessage;
}

/**
 * Batch read receipts from sync (MESSAGES_READ_BATCH).
 * Multiple messages marked read by a single user at once.
 */
export interface ReadBatchEvent {
  readonly type: 'readBatch';
  /** User who marked messages read */
  readonly userId: string;
  /** When messages were marked read */
  readonly readAt: string;
  /** Specific message IDs affected */
  readonly messageIds: string[];
}

/**
 * Single message read receipt (MESSAGE_READ_RECEIPT).
 */
export interface ReadReceiptEvent {
  readonly type: 'readReceipt';
  /** Read receipt to merge */
  readonly receipt: MessageReadReceipt;
  /** Target message ID */
  readonly messageId: string;
}

/**
 * Bulk "all messages read" socket event.
 * Reader has scrolled through or opened thread — all visible own messages are read.
 */
export interface AllReadEvent {
  readonly type: 'allRead';
  /** User who marked thread read */
  readonly readerUserId: string;
  /** When thread was marked read */
  readonly readAt: string;
}

/**
 * Message content updated (MESSAGE_UPDATED).
 * Phase 1: Stub — typed for future implementation.
 */
export interface MessageUpdatedEvent {
  readonly type: 'messageUpdated';
  readonly messageId: string;
  readonly content: string;
  readonly updatedAt: string;
}

/**
 * Message deleted (MESSAGE_DELETED).
 * Phase 1: Stub — typed for future implementation.
 */
export interface MessageDeletedEvent {
  readonly type: 'messageDeleted';
  readonly messageId: string;
  readonly deletedAt: string;
}

/**
 * Reaction added or removed (REACTION_ADDED / REACTION_REMOVED).
 * Phase 1: Stub — typed for future implementation.
 */
export interface ReactionEvent {
  readonly type: 'reaction';
  readonly messageId: string;
  readonly reaction: MessageReaction;
  readonly removed?: boolean;
}

/**
 * Side effects emitted by the reducer to be executed after paint.
 *
 * Effects are queued and run asynchronously to avoid blocking UI updates.
 * They handle persistence, acknowledgments, and state propagation.
 */
export type ThreadLiveEffect =
  | PersistEffect
  | AckEffect
  | SyncPullEffect
  | ClearUnreadEffect
  | L1PutEffect
  | ScrollEffect;

/**
 * Persist changed state to Dexie for durability.
 */
export interface PersistEffect {
  readonly type: 'persist';
  /** Event that triggered persistence (for replay/audit) */
  readonly event: ThreadLiveEvent;
}

/**
 * Acknowledge receipt to server (for socket messages).
 */
export interface AckEffect {
  readonly type: 'ack';
  /** Sync sequence to acknowledge */
  readonly syncSeq: number;
}

/**
 * Trigger sync pull to refresh thread from server.
 * Used when we detect potential gaps or after bulk operations.
 */
export interface SyncPullEffect {
  readonly type: 'syncPull';
  /** Reason for sync pull (for debugging) */
  readonly reason: 'allRead' | 'gapDetected' | 'manual';
}

/**
 * Clear unread count for this thread.
 */
export interface ClearUnreadEffect {
  readonly type: 'clearUnread';
  /** Context to clear */
  readonly contextType: ChatContextType;
  readonly contextId: string;
}

/**
 * Update L1 cache with new state.
 */
export interface L1PutEffect {
  readonly type: 'l1Put';
  /** Messages to cache */
  readonly messages: ChatMessage[];
}

/**
 * Scroll adjustment effect.
 */
export interface ScrollEffect {
  readonly type: 'scroll';
  readonly anchorMessageId?: string;
  readonly atBottom?: boolean;
}

/**
 * Result of applying live events to thread state.
 */
export interface ThreadLiveProjectionResult {
  /** Next message state — set this in React synchronously */
  readonly next: ChatMessageWithStatus[];
  /** Effects to run after paint — persist, ack, syncPull, etc. */
  readonly effects: ThreadLiveEffect[];
  /** Whether any message content/receipts changed (for shouldComponentUpdate) */
  readonly changed: boolean;
}

/**
 * Internal state for effect collection during reduction.
 */
interface ReductionState {
  messages: ChatMessageWithStatus[];
  effects: ThreadLiveEffect[];
  changed: boolean;
}

/**
 * Pure reducer: transforms thread state by applying live events.
 *
 * This is synchronous and pure — it computes the next state and effects
 * without side effects. The caller is responsible for:
 * 1. Setting `next` in React state immediately (paint)
 * 2. Running `effects` after paint (persist, ack, etc.)
 *
 * Reuses existing merge helpers (`mergeChatMessagesAscending`, `mergeReadReceipts`)
 * to ensure consistency between open-thread and bootstrap paths.
 *
 * @param prev - Current thread state
 * @param events - Live events to apply (in order)
 * @param config - Thread configuration
 * @returns Next state, effects, and change flag
 */
export function reduceThreadLiveSnapshot(
  prev: readonly ChatMessageWithStatus[],
  events: readonly ThreadLiveEvent[],
  config: ThreadLiveConfig
): ThreadLiveProjectionResult {
  const state: ReductionState = {
    messages: [...prev],
    effects: [],
    changed: false,
  };

  for (const event of events) {
    reduceSingleEvent(state, event, config);
  }

  return {
    next: state.messages,
    effects: state.effects,
    changed: state.changed,
  };
}

/**
 * Apply a single event to the reduction state.
 */
function reduceSingleEvent(
  state: ReductionState,
  event: ThreadLiveEvent,
  config: ThreadLiveConfig
): void {
  switch (event.type) {
    case 'inboundMessage':
      reduceInboundMessage(state, event, config);
      break;
    case 'readBatch':
      reduceReadBatch(state, event, config);
      break;
    case 'readReceipt':
      reduceReadReceipt(state, event, config);
      break;
    case 'allRead':
      reduceAllRead(state, event, config);
      break;
    case 'messageUpdated':
    case 'messageDeleted':
    case 'reaction':
      // Phase 1: Stubs — mark changed but don't transform yet
      state.effects.push({ type: 'persist', event });
      state.changed = true;
      break;
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/**
 * Handle inbound message event.
 *
 * Merges the new message into the thread using `mergeChatMessagesAscending`.
 * This handles both server messages and optimistic sends.
 */
function reduceInboundMessage(
  state: ReductionState,
  event: InboundMessageEvent,
  config: ThreadLiveConfig
): void {
  // Filter by chatType for GAME chats if configured
  if (config.contextType === 'GAME' && config.gameChatTypeFilter) {
    if (event.message.chatType !== config.gameChatTypeFilter) {
      return; // Skip messages not matching our filter
    }
  }

  const prevMessages = state.messages;
  const merged = mergeChatMessagesAscending(prevMessages, [event.message]);

  // Detect if actually changed
  const prevIds = new Set(prevMessages.map((m) => m.id));
  const isNewOrUpdated = !prevIds.has(event.message.id) || merged.length !== prevMessages.length;

  if (isNewOrUpdated) {
    state.messages = merged;
    state.changed = true;
    state.effects.push({ type: 'persist', event });

    // If this has a syncSeq, acknowledge it
    if (event.message.syncSeq !== undefined) {
      state.effects.push({ type: 'ack', syncSeq: event.message.syncSeq });
    }

    // If inbound message is from another user, clear unread
    if (event.message.senderId !== config.viewerUserId) {
      state.effects.push({
        type: 'clearUnread',
        contextType: config.contextType,
        contextId: config.contextId,
      });
    }

    // Update L1 cache with latest state
    state.effects.push({
      type: 'l1Put',
      messages: merged,
    });
  }
}

/**
 * Handle batch read receipts event.
 *
 * Uses `applySyncReadBatchToMessages` to mark specific messages read.
 */
function reduceReadBatch(
  state: ReductionState,
  event: ReadBatchEvent,
  _config: ThreadLiveConfig
): void {
  const result = applySyncReadBatchToMessages(
    state.messages,
    event.userId,
    event.readAt,
    event.messageIds
  );

  if (result.changed) {
    state.messages = result.next;
    state.changed = true;
    state.effects.push({ type: 'persist', event });
  }
}

/**
 * Handle single message read receipt event.
 *
 * Merges the read receipt into the target message.
 */
function reduceReadReceipt(
  state: ReductionState,
  event: ReadReceiptEvent,
  _config: ThreadLiveConfig
): void {
  const targetMessage = state.messages.find((m) => m.id === event.messageId);
  if (!targetMessage) {
    return; // Message not in current thread
  }

  const prevReceipts = targetMessage.readReceipts ?? [];
  const mergedReceipts = mergeReadReceipts(prevReceipts, event.receipt);

  // Check if actually changed
  const prevFingerprint = readReceiptsFingerprint(prevReceipts);
  const nextFingerprint = readReceiptsFingerprint(mergedReceipts);

  if (prevFingerprint !== nextFingerprint) {
    state.messages = state.messages.map((m) =>
      m.id === event.messageId
        ? { ...m, readReceipts: mergedReceipts }
        : m
    );
    state.changed = true;
    state.effects.push({ type: 'persist', event });
  }
}

/**
 * Handle bulk "all read" event.
 *
 * Marks all viewer's own visible messages as read by the reader.
 * Emits a syncPull effect to ensure server state is consistent.
 */
function reduceAllRead(
  state: ReductionState,
  event: AllReadEvent,
  config: ThreadLiveConfig
): void {
  const result = applyAllReadToOwnVisibleMessages(
    state.messages,
    event.readerUserId,
    event.readAt,
    config.viewerUserId
  );

  if (result.changed) {
    state.messages = result.next;
    state.changed = true;
    state.effects.push({ type: 'persist', event });

    // Trigger sync pull to ensure consistency
    state.effects.push({
      type: 'syncPull',
      reason: 'allRead',
    });
  }
}

/**
 * Helper: Check if a message is from the viewer.
 */
export function isOwnMessage(message: ChatMessage, viewerUserId: string): boolean {
  return message.senderId === viewerUserId;
}

/**
 * Helper: Check if a message should be visible based on chatType filter.
 */
export function shouldIncludeMessage(
  message: ChatMessage,
  contextType: ChatContextType,
  chatTypeFilter?: 'PUBLIC' | 'TEAM'
): boolean {
  if (contextType === 'GAME' && chatTypeFilter) {
    return message.chatType === chatTypeFilter;
  }
  return true;
}
