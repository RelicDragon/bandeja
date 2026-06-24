/**
 * Thread Live Projection — Phase 2
 *
 * React hook that wires socket batch processing through the live projection reducer.
 * Maps ChatRoomEvent[] → ThreadLiveEvent[], applies reducer synchronously for paint,
 * and executes effects (persist, ack, etc.) after paint.
 *
 * See ADR-007 for architectural context.
 *
 * @module
 */

import { useCallback, useMemo, useRef, type MutableRefObject } from 'react';
import type {
  ChatContextType,
  ChatMessage,
  ChatMessageWithStatus,
} from '@/api/chat';
import type { ChatType } from '@/types';
import type { ChatRoomEvent } from '@/store/socketEventsStore';
import {
  reduceThreadLiveSnapshot,
  type ThreadLiveConfig,
  type ThreadLiveEffect,
  type ThreadLiveEvent,
  type InboundMessageEvent,
  type AllReadEvent,
  type ReadReceiptEvent,
} from '@/services/chat/threadLiveProjection';
import {
  onSocketSyncSeq,
  patchLocalReadReceipt,
  persistSocketInboundMessage,
} from '@/services/chat/chatLocalApply';
import { patchThreadIndexClearUnread } from '@/services/chat/chatThreadIndex';
import { dispatchChatSyncStale } from '@/utils/chatSyncStaleEvents';
import { pullAndApplyChatSyncEventsDirect } from '@/services/chat/chatLocalApplyPull';
import { usePlayersStore } from '@/store/playersStore';
import { socketService } from '@/services/socketService';
import { applyThreadL1Put } from '@/services/chat/chatLocalApply';
import { chatLocalDb } from '@/services/chat/chatLocalDb';

/**
 * Configuration for the live projection hook.
 */
export interface UseThreadLiveProjectionConfig {
  /** Thread context type (GAME/USER/GROUP/BUG) */
  readonly contextType: ChatContextType;
  /** Thread context identifier (gameId, userId, etc.) */
  readonly contextId: string;
  /** Current viewer's user ID */
  readonly viewerUserId: string;
  /** For GAME chats, whether to filter by chatType (PUBLIC/PRIVATE) */
  readonly gameChatTypeFilter?: ChatType;
}

/**
 * Result of processing a socket batch through the projection.
 */
export interface ProjectionProcessResult {
  /** Whether any message content/receipts changed */
  changed: boolean;
  /** Number of effects queued for async execution */
  effectsCount: number;
}

/**
 * Hook for thread live projection.
 *
 * Provides:
 * - `processBatch`: Maps ChatRoomEvent[] → ThreadLiveEvent[], applies reducer, executes effects
 * - `flushEffects`: Runs any pending effects after paint
 *
 * The reducer runs synchronously for immediate UI updates, while effects
 * (persist, ack, etc.) are queued and run asynchronously.
 */
export function useThreadLiveProjection(
  config: UseThreadLiveProjectionConfig,
  messagesRef: MutableRefObject<ChatMessageWithStatus[]>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageWithStatus[]>>,
  _chatContainerRef: React.RefObject<HTMLDivElement | null>,
  handleNewMessage?: (message: ChatMessage) => string | void,
  handleMessageReaction?: (reaction: unknown) => void,
  handleReadReceipt?: (readReceipt: unknown) => void,
  handleMessageDeleted?: (data: { messageId: string }) => void,
  handleMessageUpdated?: (updated: ChatMessage) => void
) {
  const effectsQueueRef = useRef<ThreadLiveEffect[]>([]);

  const threadLiveConfig: ThreadLiveConfig = useMemo(() => ({
    contextType: config.contextType,
    contextId: config.contextId,
    viewerUserId: config.viewerUserId,
    gameChatTypeFilter: config.gameChatTypeFilter,
  }), [config.contextType, config.contextId, config.viewerUserId, config.gameChatTypeFilter]);

  /**
   * Execute a single effect async (non-blocking).
   * Effects run after paint to avoid blocking UI updates.
   */
  const executeEffect = useCallback(
    (effect: ThreadLiveEffect): void => {
      switch (effect.type) {
        case 'persist': {
          // Each event type has its own persist logic
          executePersistEffect(effect.event, config, _chatContainerRef, {
            handleNewMessage,
            handleMessageReaction,
            handleReadReceipt,
            handleMessageDeleted,
            handleMessageUpdated,
          });
          break;
        }
        case 'ack': {
          void onSocketSyncSeq(config.contextType, config.contextId, effect.syncSeq).catch(() => { });
          break;
        }
        case 'syncPull': {
          if (effect.reason === 'allRead') {
            void pullAndApplyChatSyncEventsDirect(config.contextType, config.contextId).catch(() => { });
          }
          break;
        }
        case 'clearUnread': {
          if (config.contextType === 'USER') {
            usePlayersStore.getState().updateUnreadCount(config.contextId, 0);
            void patchThreadIndexClearUnread('USER', config.contextId);
          } else if (config.contextType === 'GROUP') {
            window.dispatchEvent(
              new CustomEvent('chat-viewing-clear-unread', {
                detail: { contextType: 'GROUP', contextId: config.contextId },
              })
            );
          } else if (config.contextType === 'GAME') {
            void patchThreadIndexClearUnread('GAME', config.contextId);
          }
          break;
        }
        case 'l1Put': {
          void applyThreadL1Put({
            contextType: config.contextType,
            contextId: config.contextId,
            gameChatType: config.contextType === 'GAME' ? config.gameChatTypeFilter : undefined,
            readRows: () => effect.messages,
            verify: () => true,
          }).catch(() => { });
          break;
        }
        case 'reconcileAck': {
          // Reconcile optimistic message in Dexie: delete temp, put real
          void chatLocalDb.messages.delete(effect.tempId).catch(() => { });
          const attempt = () => persistSocketInboundMessage(config.contextType, config.contextId, effect.message, effect.message.syncSeq);
          void attempt().catch(() => { });
          break;
        }
        case 'scroll': {
          // Placeholder for future scroll effects
          break;
        }
        default: {
          const _exhaustive: never = effect;
          return _exhaustive;
        }
      }
    },
    [
      config,
      _chatContainerRef,
      handleNewMessage,
      handleMessageReaction,
      handleReadReceipt,
      handleMessageDeleted,
      handleMessageUpdated,
    ]
  );

  /**
   * Flush all queued effects after paint.
   * Called after React has committed the new state.
   */
  const flushEffects = useCallback((): number => {
    const effects = effectsQueueRef.current;
    if (effects.length === 0) return 0;
    effectsQueueRef.current = [];

    // Run all effects async (non-blocking)
    for (const effect of effects) {
      executeEffect(effect);
    }
    return effects.length;
  }, [executeEffect]);

  /**
   * Process a socket batch through the live projection reducer.
   *
   * Flow:
   * 1. Map ChatRoomEvent[] → ThreadLiveEvent[]
   * 2. Apply reducer synchronously → get next state + effects
   * 3. Set messages in React state (paint)
   * 4. Queue effects for async execution
   *
   * Returns whether any changes were made and effect count.
   */
  const processBatch = useCallback(
    (batch: ChatRoomEvent[]): ProjectionProcessResult => {
      if (batch.length === 0) {
        return { changed: false, effectsCount: 0 };
      }

      const prev = messagesRef.current;

      // Step 1: Map ChatRoomEvent[] → ThreadLiveEvent[]
      const liveEvents = mapBatchToLiveEvents(batch);

      // Step 2: Apply reducer synchronously
      const result = reduceThreadLiveSnapshot(prev, liveEvents, threadLiveConfig);

      // Step 3: Set messages in React state (paint)
      if (result.changed) {
        setMessages(result.next);
        messagesRef.current = result.next;
      }

      // Step 4: Queue effects for async execution
      effectsQueueRef.current.push(...result.effects);

      return {
        changed: result.changed,
        effectsCount: result.effects.length,
      };
    },
    [threadLiveConfig, messagesRef, setMessages]
  );

  /**
   * Push a single domain event into the live projection.
   * Useful for UI-triggered events like optimistic sends or ACKs.
   */
  const pushEvent = useCallback(
    (event: ThreadLiveEvent): ProjectionProcessResult => {
      const prev = messagesRef.current;
      const result = reduceThreadLiveSnapshot(prev, [event], threadLiveConfig);

      if (result.changed) {
        setMessages(result.next);
        messagesRef.current = result.next;
      }

      effectsQueueRef.current.push(...result.effects);

      return {
        changed: result.changed,
        effectsCount: result.effects.length,
      };
    },
    [threadLiveConfig, messagesRef, setMessages]
  );

  return {
    processBatch,
    pushEvent,
    flushEffects,
  };
}

/**
 * Map ChatRoomEvent[] to ThreadLiveEvent[].
 *
 * This is the adapter layer between socket events (ChatRoomEvent)
 * and the live projection domain model (ThreadLiveEvent).
 */
function mapBatchToLiveEvents(
  batch: ChatRoomEvent[]
): ThreadLiveEvent[] {
  const events: ThreadLiveEvent[] = [];

  for (const ev of batch) {
    switch (ev.kind) {
      case 'message': {
        const data = ev.data;
        events.push({
          type: 'inboundMessage',
          message: { ...data.message, syncSeq: data.message.syncSeq ?? data.syncSeq },
        } satisfies InboundMessageEvent);

        break;
      }
      case 'readReceipt': {
        const data = ev.data;
        const rr = data.readReceipt;
        const readAt =
          rr?.readAt == null
            ? undefined
            : typeof rr.readAt === 'string'
              ? rr.readAt
              : new Date(rr.readAt as string | number | Date).toISOString();

        if (rr?.allRead && rr.userId && readAt) {
          events.push({
            type: 'allRead',
            readerUserId: rr.userId,
            readAt,
          } satisfies AllReadEvent);
        } else if (rr?.messageId && rr.userId && readAt) {
          // Single message read receipt - map to readReceipt event
          events.push({
            type: 'readReceipt',
            receipt: {
              id: `receipt-${rr.messageId}-${rr.userId}`,
              messageId: rr.messageId,
              userId: rr.userId,
              readAt,
            },
            messageId: rr.messageId,
          } satisfies ReadReceiptEvent);
        }
        break;
      }
      case 'reaction': {
        // Phase 2: Reactions are stubs - handled by existing handlers
        // In Phase 3, we'll map these to ReactionEvent
        break;
      }
      case 'deleted': {
        // Phase 2: Deletes are stubs - handled by existing handlers
        // In Phase 3, we'll map these to MessageDeletedEvent
        break;
      }
      case 'messageUpdated': {
        // Phase 2: Updates are stubs - handled by existing handlers
        // In Phase 3, we'll map these to MessageUpdatedEvent
        break;
      }
      case 'transcription':
      case 'translation':
      case 'pollVote':
        // These are message field updates, handled separately
        break;
      default:
        break;
    }
  }

  return events;
}

/**
 * Execute persist effect for a specific event type.
 *
 * Each event type has its own persistence logic (Dexie writes, acks, etc.).
 * This function routes the persist effect to the correct handler.
 */
function executePersistEffect(
  event: ThreadLiveEvent,
  config: UseThreadLiveProjectionConfig,
  _chatContainerRef: React.RefObject<HTMLDivElement | null>,
  handlers: {
    handleNewMessage?: (message: ChatMessage) => string | void;
    handleMessageReaction?: (reaction: unknown) => void;
    handleReadReceipt?: (readReceipt: unknown) => void;
    handleMessageDeleted?: (data: { messageId: string }) => void;
    handleMessageUpdated?: (updated: ChatMessage) => void;
  }
): void {
  switch (event.type) {
    case 'inboundMessage': {
      const message = event.message;
      const syncSeq = message.syncSeq;

      // Persist to Dexie with recovery
      const attempt = () => persistSocketInboundMessage(config.contextType, config.contextId, message, syncSeq);
      void attempt().catch(() => {
        void attempt().catch(() => {
          dispatchChatSyncStale(config.contextType, config.contextId, 'cursorStale');
        });
      });

      // Ack socket syncSeq if present
      if (syncSeq !== undefined) {
        void onSocketSyncSeq(config.contextType, config.contextId, syncSeq).catch(() => { });
      }

      // Ack message receipt for messages from other users
      if (message.senderId !== config.viewerUserId) {
        socketService.acknowledgeMessage(
          message.id,
          config.contextType as 'GAME' | 'BUG' | 'USER' | 'GROUP',
          config.contextId
        );
        socketService.confirmMessageReceipt(message.id, 'socket');
      }

      // Call legacy handler for compatibility (will be removed in Phase 4)
      handlers.handleNewMessage?.(message);
      break;
    }
    case 'readReceipt': {
      const { receipt, messageId } = event;
      void patchLocalReadReceipt({
        messageId,
        userId: receipt.userId,
        readAt: receipt.readAt,
      }).catch(() => { });

      // Call legacy handler for compatibility
      handlers.handleReadReceipt?.({
        messageId,
        userId: receipt.userId,
        readAt: receipt.readAt,
      });
      break;
    }
    case 'readBatch': {
      // Read batch events come from sync, not socket
      // Persistence is handled by the sync layer
      break;
    }
    case 'allRead': {
      // allRead is handled via syncPull effect
      // Individual receipt patches happen in the reducer
      // We'll let the syncPull effect handle the full consistency
      break;
    }
    case 'optimisticSend': {
      // Optimistic send adds to Dexie for durability
      const attempt = () => persistSocketInboundMessage(config.contextType, config.contextId, event.message, undefined);
      void attempt().catch(() => { });
      break;
    }
    case 'messageAck': {
      // ACK replaces optimistic message in Dexie
      const attempt = () => persistSocketInboundMessage(config.contextType, config.contextId, event.message, event.message.syncSeq);
      void attempt().catch(() => { });
      break;
    }
    case 'hydrateSnapshot': {
      // Hydration comes FROM Dexie, no need to persist back
      break;
    }
    case 'messageUpdated':
    case 'messageDeleted':
    case 'reaction': {
      // Phase 2: Stubs - legacy handlers will manage these
      // In Phase 3, we'll have full persist logic here
      break;
    }
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}
