/**
 * Thread Live Projection reducer tests
 *
 * Replay tests using event-log fixtures to verify reducer behavior
 * without React, Dexie, or socket mocks.
 */

import { describe, expect, it } from 'vitest';
import type { ChatMessageWithStatus } from '@/api/chat';
import {
  reduceThreadLiveSnapshot,
  type ThreadLiveConfig,
  type InboundMessageEvent,
  type ReadBatchEvent,
  type AllReadEvent,
} from '@/services/chat/threadLiveProjection';

/** Test fixture: create a basic message */
function createMessage(
  overrides: Partial<ChatMessageWithStatus> = {}
): ChatMessageWithStatus {
  const id = overrides.id ?? `msg-${Math.random().toString(36).slice(2)}`;
  const createdAt = overrides.createdAt ?? '2026-01-01T00:00:00.000Z';
  const updatedAt = overrides.updatedAt ?? createdAt;

  return {
    id,
    chatContextType: 'GAME',
    contextId: 'game-1',
    senderId: overrides.senderId ?? 'user-1',
    content: overrides.content ?? `Message ${id}`,
    mediaUrls: [],
    thumbnailUrls: [],
    mentionIds: [],
    state: 'DELIVERED',
    chatType: 'PUBLIC',
    createdAt,
    updatedAt,
    sender: null,
    reactions: [],
    readReceipts: [],
    ...overrides,
  };
}

/** Test fixture: config for a GAME chat thread */
const GAME_CONFIG: ThreadLiveConfig = {
  contextType: 'GAME',
  contextId: 'game-1',
  viewerUserId: 'viewer-1',
  gameChatTypeFilter: 'PUBLIC',
};

/** Test fixture: config for a USER DM thread */
const USER_CONFIG: ThreadLiveConfig = {
  contextType: 'USER',
  contextId: 'user-2',
  viewerUserId: 'viewer-1',
};

describe('reduceThreadLiveSnapshot', () => {
  describe('inboundMessage events', () => {
    it('merges a single inbound message into empty thread', () => {
      const prev: ChatMessageWithStatus[] = [];
      const newMessage = createMessage({ id: 'msg-1', senderId: 'other-user' });
      const events: InboundMessageEvent[] = [
        { type: 'inboundMessage', message: newMessage },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, GAME_CONFIG);

      expect(result.next).toHaveLength(1);
      expect(result.next[0]?.id).toBe('msg-1');
      expect(result.changed).toBe(true);
      expect(result.effects).toHaveLength(3); // persist + clearUnread (from other user) + l1Put
    });

    it('merges two inbound messages while thread open', () => {
      const prev = [createMessage({ id: 'msg-1' }), createMessage({ id: 'msg-2' })];
      const msg3 = createMessage({ id: 'msg-3', createdAt: '2026-01-01T00:01:00.000Z', senderId: 'other-user' });
      const msg4 = createMessage({ id: 'msg-4', createdAt: '2026-01-01T00:02:00.000Z', senderId: 'other-user' });
      const events: InboundMessageEvent[] = [
        { type: 'inboundMessage', message: msg3 },
        { type: 'inboundMessage', message: msg4 },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, GAME_CONFIG);

      expect(result.next).toHaveLength(4);
      expect(result.changed).toBe(true);
      expect(result.effects).toHaveLength(6); // 2 persist + 2 clearUnread + 2 l1Put (from other users)
      expect(result.next.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3', 'msg-4']);
    });

    it('handles duplicate message ID by treating as no-op when equal', () => {
      const prev = [createMessage({ id: 'msg-1', content: 'Old content' })];
      const duplicate = createMessage({
        id: 'msg-1',
        content: 'New content', // Content won't update - inboundMessage is for new messages
        createdAt: '2026-01-01T00:00:00.000Z', // Same createdAt as prev
        updatedAt: '2026-01-01T00:01:00.000Z',
      });
      const events: InboundMessageEvent[] = [
        { type: 'inboundMessage', message: duplicate },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, GAME_CONFIG);

      // When messages are equal (same ID, createdAt, no syncSeq), mergeChatMessagesAscending
      // treats them as duplicates and keeps the existing message.
      // Content updates would use messageUpdated event type in Phase 2.
      expect(result.next).toHaveLength(1);
      expect(result.next[0]?.content).toBe('Old content'); // Content unchanged
      expect(result.changed).toBe(false); // No change detected
    });

    it('acknowledges socket message with syncSeq', () => {
      const prev: ChatMessageWithStatus[] = [];
      const socketMessage = createMessage({
        id: 'msg-1',
        syncSeq: 42,
        senderId: 'other-user',
      });
      const events: InboundMessageEvent[] = [
        { type: 'inboundMessage', message: socketMessage },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, GAME_CONFIG);

      expect(result.effects).toContainEqual({ type: 'ack', syncSeq: 42 });
    });

    it('filters by chatType for GAME chats when configured', () => {
      const prev: ChatMessageWithStatus[] = [];
      const publicMessage = createMessage({
        id: 'msg-1',
        chatType: 'PUBLIC',
        senderId: 'other-user',
      });
      const teamMessage = createMessage({
        id: 'msg-2',
        chatType: 'PRIVATE',
        senderId: 'other-user',
      });
      const events: InboundMessageEvent[] = [
        { type: 'inboundMessage', message: publicMessage },
        { type: 'inboundMessage', message: teamMessage },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, GAME_CONFIG);

      // Only PUBLIC message should be included
      expect(result.next).toHaveLength(1);
      expect(result.next[0]?.id).toBe('msg-1');
    });

    it('does not emit clearUnread for own messages', () => {
      const prev: ChatMessageWithStatus[] = [];
      const ownMessage = createMessage({
        id: 'msg-1',
        senderId: 'viewer-1', // Same as viewerUserId
      });
      const events: InboundMessageEvent[] = [
        { type: 'inboundMessage', message: ownMessage },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, GAME_CONFIG);

      // Should have persist + l1Put, but NOT clearUnread
      const effectTypes = result.effects.map((e) => e.type);
      expect(effectTypes).toContain('persist');
      expect(effectTypes).toContain('l1Put');
      expect(effectTypes).not.toContain('clearUnread');
    });
  });

  describe('readBatch events', () => {
    it('applies readBatch to two own messages', () => {
      const prev = [
        createMessage({ id: 'msg-1', senderId: 'viewer-1' }),
        createMessage({ id: 'msg-2', senderId: 'viewer-1' }),
        createMessage({ id: 'msg-3', senderId: 'other-user' }),
      ];
      const readAt = '2026-01-01T01:00:00.000Z';
      const events: ReadBatchEvent[] = [
        {
          type: 'readBatch',
          userId: 'reader-user',
          readAt,
          messageIds: ['msg-1', 'msg-2'],
        },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, USER_CONFIG);

      expect(result.next).toHaveLength(3);
      expect(result.changed).toBe(true);

      // msg-1 should have read receipt
      const msg1 = result.next.find((m) => m.id === 'msg-1');
      expect(msg1?.readReceipts).toHaveLength(1);
      expect(msg1?.readReceipts[0]?.userId).toBe('reader-user');
      expect(msg1?.readReceipts[0]?.readAt).toBe(readAt);

      // msg-2 should have read receipt
      const msg2 = result.next.find((m) => m.id === 'msg-2');
      expect(msg2?.readReceipts).toHaveLength(1);
      expect(msg2?.readReceipts[0]?.userId).toBe('reader-user');

      // msg-3 should not have read receipt
      const msg3 = result.next.find((m) => m.id === 'msg-3');
      expect(msg3?.readReceipts).toHaveLength(0);
    });

    it('is idempotent when readBatch already applied', () => {
      const readAt = '2026-01-01T01:00:00.000Z';
      const prev = [
        createMessage({
          id: 'msg-1',
          senderId: 'viewer-1',
          readReceipts: [{ id: 'r1', messageId: 'msg-1', userId: 'reader-user', readAt }],
        }),
      ];
      const events: ReadBatchEvent[] = [
        {
          type: 'readBatch',
          userId: 'reader-user',
          readAt,
          messageIds: ['msg-1'],
        },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, USER_CONFIG);

      // Should not mark as changed since receipt already present
      expect(result.changed).toBe(false);
      expect(result.effects).toHaveLength(0);
    });
  });

  describe('allRead events', () => {
    it('marks all own visible messages read by the reader', () => {
      const prev = [
        createMessage({ id: 'msg-1', senderId: 'viewer-1' }),
        createMessage({ id: 'msg-2', senderId: 'viewer-1' }),
        createMessage({ id: 'msg-3', senderId: 'other-user' }),
      ];
      const readAt = '2026-01-01T01:00:00.000Z';
      const events: AllReadEvent[] = [
        {
          type: 'allRead',
          readerUserId: 'reader-user',
          readAt,
        },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, USER_CONFIG);

      expect(result.next).toHaveLength(3);
      expect(result.changed).toBe(true);

      // msg-1 (own) should have read receipt
      const msg1 = result.next.find((m) => m.id === 'msg-1');
      expect(msg1?.readReceipts).toHaveLength(1);
      expect(msg1?.readReceipts[0]?.userId).toBe('reader-user');

      // msg-2 (own) should have read receipt
      const msg2 = result.next.find((m) => m.id === 'msg-2');
      expect(msg2?.readReceipts).toHaveLength(1);
      expect(msg2?.readReceipts[0]?.userId).toBe('reader-user');

      // msg-3 (not own) should not have read receipt
      const msg3 = result.next.find((m) => m.id === 'msg-3');
      expect(msg3?.readReceipts).toHaveLength(0);
    });

    it('emits syncPull effect after allRead', () => {
      const prev = [
        createMessage({ id: 'msg-1', senderId: 'viewer-1' }),
        createMessage({ id: 'msg-2', senderId: 'viewer-1' }),
      ];
      const readAt = '2026-01-01T01:00:00.000Z';
      const events: AllReadEvent[] = [
        {
          type: 'allRead',
          readerUserId: 'reader-user',
          readAt,
        },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, USER_CONFIG);

      // Should emit syncPull effect
      expect(result.effects).toContainEqual({
        type: 'syncPull',
        reason: 'allRead',
      });
    });

    it('is idempotent when allRead already applied', () => {
      const readAt = '2026-01-01T01:00:00.000Z';
      const prev = [
        createMessage({
          id: 'msg-1',
          senderId: 'viewer-1',
          readReceipts: [{ id: 'r1', messageId: 'msg-1', userId: 'reader-user', readAt }],
        }),
      ];
      const events: AllReadEvent[] = [
        {
          type: 'allRead',
          readerUserId: 'reader-user',
          readAt,
        },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, USER_CONFIG);

      // Should not mark as changed since receipt already present
      expect(result.changed).toBe(false);
    });
  });

  describe('mixed event sequences', () => {
    it('handles inbound followed by readBatch', () => {
      const prev = [
        createMessage({ id: 'msg-1', senderId: 'viewer-1' }),
      ];
      const newMessage = createMessage({ id: 'msg-2', senderId: 'viewer-1' });
      const readAt = '2026-01-01T01:00:00.000Z';

      const events = [
        { type: 'inboundMessage' as const, message: newMessage },
        {
          type: 'readBatch' as const,
          userId: 'reader-user',
          readAt,
          messageIds: ['msg-1', 'msg-2'],
        },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, USER_CONFIG);

      expect(result.next).toHaveLength(2);
      expect(result.changed).toBe(true);

      // Both messages should have read receipts
      const msg1 = result.next.find((m) => m.id === 'msg-1');
      const msg2 = result.next.find((m) => m.id === 'msg-2');
      expect(msg1?.readReceipts).toHaveLength(1);
      expect(msg2?.readReceipts).toHaveLength(1);
    });

    it('handles allRead followed by more inbound', () => {
      const prev = [
        createMessage({ id: 'msg-1', senderId: 'viewer-1' }),
      ];
      const readAt = '2026-01-01T01:00:00.000Z';

      const events = [
        {
          type: 'allRead' as const,
          readerUserId: 'reader-user',
          readAt,
        },
        {
          type: 'inboundMessage' as const,
          message: createMessage({ id: 'msg-2', senderId: 'viewer-1' }),
        },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, USER_CONFIG);

      expect(result.next).toHaveLength(2);
      expect(result.changed).toBe(true);

      // Should have syncPull from allRead
      expect(result.effects).toContainEqual({
        type: 'syncPull',
        reason: 'allRead',
      });
    });
  });

  describe('change detection', () => {
    it('returns changed=false when no events applied', () => {
      const prev = [createMessage({ id: 'msg-1' })];
      const events: InboundMessageEvent[] = [];

      const result = reduceThreadLiveSnapshot(prev, events, GAME_CONFIG);

      expect(result.changed).toBe(false);
      expect(result.next).toEqual(prev);
    });

    it('returns changed=false when event has no effect', () => {
      const prev = [
        createMessage({
          id: 'msg-1',
          readReceipts: [{ id: 'r1', messageId: 'msg-1', userId: 'reader', readAt: '2026-01-01T01:00:00.000Z' }],
        }),
      ];
      const events: ReadBatchEvent[] = [
        {
          type: 'readBatch',
          userId: 'reader',
          readAt: '2026-01-01T01:00:00.000Z',
          messageIds: ['msg-1'],
        },
      ];

      const result = reduceThreadLiveSnapshot(prev, events, USER_CONFIG);

      expect(result.changed).toBe(false);
    });
  });

  describe('message mutation events', () => {
    it('applies messageUpdated and messageDeleted events', () => {
      const prev = [createMessage({ id: 'msg-1' })];

      const updatedResult = reduceThreadLiveSnapshot(
        prev,
        [{ type: 'messageUpdated', messageId: 'msg-1', content: 'Updated', updatedAt: '2026-01-01T01:00:00.000Z' }],
        USER_CONFIG
      );
      expect(updatedResult.changed).toBe(true);
      expect(updatedResult.next[0].content).toBe('Updated');
      expect(updatedResult.effects.map((effect) => effect.type)).toEqual(['persist', 'l1Put']);

      const deletedResult = reduceThreadLiveSnapshot(
        prev,
        [{ type: 'messageDeleted', messageId: 'msg-1', deletedAt: '2026-01-01T01:00:00.000Z' }],
        USER_CONFIG
      );
      expect(deletedResult.changed).toBe(true);
      expect(deletedResult.next).toHaveLength(0);
      expect(deletedResult.effects.map((effect) => effect.type)).toEqual(['persist', 'l1Put']);
    });

    it('preserves translation when a non-content field is updated', () => {
      const original = createMessage({
        id: 'msg-preview',
        content: 'Hola',
        translation: { languageCode: 'en', translation: 'Hello' },
      });
      const updated = { ...original, linkPreviewDisabled: true, translation: undefined };
      const result = reduceThreadLiveSnapshot(
        [original],
        [{ type: 'messageUpdated', messageId: original.id, message: updated }],
        USER_CONFIG
      );

      expect(result.next[0]?.linkPreviewDisabled).toBe(true);
      expect(result.next[0]?.translation?.translation).toBe('Hello');
    });

    it('applies reaction events', () => {
      const prev = [createMessage({ id: 'msg-1' })];

      const addedResult = reduceThreadLiveSnapshot(
        prev,
        [
          {
            type: 'reaction',
            messageId: 'msg-1',
            reaction: {
              id: 'reaction-1',
              messageId: 'msg-1',
              userId: 'reader-1',
              emoji: ':thumbsup:',
              createdAt: '2026-01-01T01:00:00.000Z',
              user: { id: 'reader-1', firstName: 'Reader' },
            },
          },
        ],
        USER_CONFIG
      );
      expect(addedResult.changed).toBe(true);
      expect(addedResult.next[0].reactions).toHaveLength(1);

      const removedResult = reduceThreadLiveSnapshot(
        addedResult.next,
        [
          {
            type: 'reaction',
            messageId: 'msg-1',
            removed: true,
            reaction: addedResult.next[0].reactions[0]!,
          },
        ],
        USER_CONFIG
      );
      expect(removedResult.changed).toBe(true);
      expect(removedResult.next[0].reactions).toHaveLength(0);
    });
  });

  describe('Phase 3: Optimistic Send/ACK', () => {
    it('optimisticSend adds message with SENDING status', () => {
      const prev: ChatMessageWithStatus[] = [];
      const optimisticMsg = createMessage({
        id: 'temp-1',
        senderId: 'viewer-1',
        clientMutationId: 'c1',
      });

      const result = reduceThreadLiveSnapshot(
        prev,
        [{ type: 'optimisticSend', message: optimisticMsg }],
        USER_CONFIG
      );

      expect(result.next).toHaveLength(1);
      expect(result.next[0]._status).toBe('SENDING');
      expect(result.next[0].id).toBe('temp-1');
      expect(result.changed).toBe(true);
      expect(result.effects).toContainEqual({ type: 'l1Put', messages: result.next });
    });

    it('messageAck replaces optimistic message with server message', () => {
      const optimisticMsg = createMessage({
        id: 'temp-1',
        senderId: 'viewer-1',
        clientMutationId: 'c1',
        _status: 'SENDING',
      });
      const prev = [optimisticMsg];

      const serverMsg = { ...optimisticMsg, id: 'real-1', _status: undefined };
      const result = reduceThreadLiveSnapshot(
        prev,
        [{ type: 'messageAck', clientId: 'c1', message: serverMsg }],
        USER_CONFIG
      );

      expect(result.next).toHaveLength(1);
      expect(result.next[0].id).toBe('real-1');
      expect(result.next[0]._status).toBeUndefined();
      expect(result.changed).toBe(true);
    });

    it('messageAck falls back to inbound if clientId not found', () => {
      const prev: ChatMessageWithStatus[] = [];
      const serverMsg = createMessage({ id: 'real-1' });

      const result = reduceThreadLiveSnapshot(
        prev,
        [{ type: 'messageAck', clientId: 'missing', message: serverMsg }],
        USER_CONFIG
      );

      expect(result.next).toHaveLength(1);
      expect(result.next[0].id).toBe('real-1');
      expect(result.changed).toBe(true);
    });
  });

  describe('Phase 3: Reconcile Hydrate', () => {
    it('hydrateSnapshot merges with current live state', () => {
      const liveMsg = createMessage({ id: 'live-1', createdAt: '2026-01-01T00:01:00.000Z' });
      const prev = [liveMsg];

      const hydratedMsgs = [
        createMessage({ id: 'old-1', createdAt: '2026-01-01T00:00:00.000Z' }),
        createMessage({ id: 'live-1', createdAt: '2026-01-01T00:01:00.000Z' }), // Duplicate
      ];

      const result = reduceThreadLiveSnapshot(
        prev,
        [{ type: 'hydrateSnapshot', messages: hydratedMsgs }],
        USER_CONFIG
      );

      expect(result.next).toHaveLength(2);
      expect(result.next.map((m) => m.id)).toEqual(['old-1', 'live-1']);
      expect(result.changed).toBe(true);
    });

    it('hydrateSnapshot preserves pending optimistic messages', () => {
      const optimisticMsg = createMessage({ id: 'temp-1', _status: 'SENDING', createdAt: '2026-01-01T00:02:00.000Z' });
      const prev = [optimisticMsg];

      const hydratedMsgs = [createMessage({ id: 'old-1', createdAt: '2026-01-01T00:00:00.000Z' })];

      const result = reduceThreadLiveSnapshot(
        prev,
        [{ type: 'hydrateSnapshot', messages: hydratedMsgs }],
        USER_CONFIG
      );

      expect(result.next).toHaveLength(2);
      expect(result.next.find((m) => m.id === 'temp-1')).toBeDefined();
      expect(result.next.find((m) => m.id === 'temp-1')?._status).toBe('SENDING');
    });

    it('hydrateSnapshot updates read receipts when message ids are unchanged', () => {
      const prev = [
        createMessage({
          id: 'msg-1',
          senderId: 'viewer-1',
          readReceipts: [],
        }),
      ];
      const hydratedMsgs = [
        createMessage({
          id: 'msg-1',
          senderId: 'viewer-1',
          readReceipts: [
            {
              id: 'receipt-msg-1-reader-1',
              messageId: 'msg-1',
              userId: 'reader-1',
              readAt: '2026-01-01T00:05:00.000Z',
            },
          ],
        }),
      ];

      const result = reduceThreadLiveSnapshot(
        prev,
        [{ type: 'hydrateSnapshot', messages: hydratedMsgs }],
        USER_CONFIG
      );

      expect(result.changed).toBe(true);
      expect(result.next).toHaveLength(1);
      expect(result.next[0].readReceipts).toHaveLength(1);
      expect(result.next[0].readReceipts?.[0]?.userId).toBe('reader-1');
      expect(result.effects).toContainEqual({ type: 'l1Put', messages: result.next });
    });

    it('hydrateSnapshot applies newer message fields when ids are unchanged', () => {
      const prev = [
        createMessage({
          id: 'msg-1',
          content: 'Before edit',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ];
      const hydratedMsgs = [
        createMessage({
          id: 'msg-1',
          content: 'After edit',
          updatedAt: '2026-01-01T00:10:00.000Z',
        }),
      ];

      const result = reduceThreadLiveSnapshot(
        prev,
        [{ type: 'hydrateSnapshot', messages: hydratedMsgs }],
        USER_CONFIG
      );

      expect(result.changed).toBe(true);
      expect(result.next[0].content).toBe('After edit');
      expect(result.next[0].updatedAt).toBe('2026-01-01T00:10:00.000Z');
    });

    it('is idempotent if hydrated snapshot matches current exactly', () => {
      const msg1 = createMessage({ id: 'msg-1' });
      const prev = [msg1];

      const result = reduceThreadLiveSnapshot(
        prev,
        [{ type: 'hydrateSnapshot', messages: [msg1] }],
        USER_CONFIG
      );

      expect(result.changed).toBe(false);
    });
  });
});
