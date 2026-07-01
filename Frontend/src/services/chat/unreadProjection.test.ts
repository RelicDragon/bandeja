import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contextKey } from '@/services/chat/unreadSnapshot';
import {
  createInitialUnreadProjectionState,
  reduceUnreadProjection,
  shouldSkipMarkReadNetwork,
} from '@/services/chat/unreadProjection';

const config = {
  shouldSuppressDisplay: () => false,
};

describe('unreadProjection (#243)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('markReadRequested clears displayed count optimistically', () => {
    const key = contextKey('USER', 'c1');
    let state = createInitialUnreadProjectionState();
    state = {
      ...state,
      baseByContext: { [key]: 3 },
      fetchedAt: Date.now(),
    };

    const { state: next } = reduceUnreadProjection(
      state,
      { type: 'markReadRequested', contextKey: key, clientOpId: 'op-1' },
      config
    );

    expect(next.displayedByContext[key]).toBeUndefined();
    expect(next.baseByContext[key]).toBe(3);
    expect(next.markInFlight.has(key)).toBe(true);
    expect(next.optimistic[key]).toEqual({ type: 'clear', previousCount: 3, clientOpId: 'op-1' });
  });

  it('stale authority envelope does not raise displayed count after optimistic clear', () => {
    const key = contextKey('USER', 'c1');
    let state = createInitialUnreadProjectionState();
    state = {
      ...state,
      baseByContext: { [key]: 3 },
      contextRevisions: { [key]: 5 },
      maxSeenUserUnreadRevision: 10,
      fetchedAt: Date.now(),
    };

    const cleared = reduceUnreadProjection(
      state,
      { type: 'markReadRequested', contextKey: key, clientOpId: 'op-1' },
      config
    ).state;

    const { state: afterStale } = reduceUnreadProjection(
      cleared,
      {
        type: 'authorityEnvelopeReceived',
        resolvedKey: key,
        envelope: {
          contextType: 'USER',
          contextId: 'c1',
          unreadCount: 5,
          contextKey: key,
          clock: { userUnreadRevision: 9, userContextUnreadRevision: 4 },
        },
      },
      config
    );

    expect(afterStale.displayedByContext[key] ?? 0).toBe(0);
  });

  it('shouldSkipMarkReadNetwork when confirmed and no local unread', () => {
    const key = contextKey('USER', 'c1');
    const state = {
      ...createInitialUnreadProjectionState(),
      markReadConfirmedKeys: new Set([key]),
    };
    expect(shouldSkipMarkReadNetwork(state, key)).toBe(true);
  });

  it('logout resets projection state', () => {
    const key = contextKey('USER', 'c1');
    const state = {
      ...createInitialUnreadProjectionState(),
      baseByContext: { [key]: 2 },
      fetchedAt: Date.now(),
    };
    const { state: next } = reduceUnreadProjection(state, { type: 'logout' }, config);
    expect(next.baseByContext).toEqual({});
    expect(next.fetchedAt).toBe(0);
  });
});

const viewingUserChatId = vi.hoisted(() => ({ current: null as string | null }));

const phase4Config = {
  shouldSuppressDisplay: (contextType: string, contextId: string) =>
    contextType === 'USER' && viewingUserChatId.current === contextId,
};

describe('Phase 4 optimistic receive (#244)', () => {
  const key = contextKey('USER', 'chat-dm');
  const senderId = 'other-user';

  beforeEach(() => {
    viewingUserChatId.current = null;
  });

  it('inbound message not viewing bumps display immediately', () => {
    let state = createInitialUnreadProjectionState();
    state = reduceUnreadProjection(
      state,
      { type: 'inboundMessageSeen', contextKey: key, messageId: 'm1', senderId },
      phase4Config
    ).state;

    expect(state.displayedByContext[key]).toBe(1);
    expect(state.baseByContext[key]).toBeUndefined();
    expect(state.optimistic[key]).toEqual({ type: 'bump', pendingCount: 1, messageIds: ['m1'] });
  });

  it('authority envelope reconciles bump without flicker', () => {
    let state = createInitialUnreadProjectionState();
    state = {
      ...state,
      baseByContext: { [key]: 2 },
      displayedByContext: { [key]: 2 },
    };
    state = reduceUnreadProjection(
      state,
      { type: 'inboundMessageSeen', contextKey: key, messageId: 'm2', senderId },
      phase4Config
    ).state;
    expect(state.displayedByContext[key]).toBe(3);

    state = reduceUnreadProjection(
      state,
      {
        type: 'authorityEnvelopeReceived',
        resolvedKey: key,
        envelope: {
          contextType: 'USER',
          contextId: 'chat-dm',
          unreadCount: 3,
          contextKey: key,
          clock: { userUnreadRevision: 5, userContextUnreadRevision: 2 },
        },
      },
      phase4Config
    ).state;

    expect(state.baseByContext[key]).toBe(3);
    expect(state.displayedByContext[key]).toBe(3);
    expect(state.optimistic[key]).toBeUndefined();
  });

  it('inbound message while viewing does not bump display', () => {
    viewingUserChatId.current = 'chat-dm';
    let state = createInitialUnreadProjectionState();
    state = reduceUnreadProjection(
      state,
      { type: 'inboundMessageSeen', contextKey: key, messageId: 'm1', senderId },
      phase4Config
    ).state;

    expect(state.displayedByContext[key]).toBeUndefined();
    expect(state.optimistic[key]).toBeUndefined();
  });

  it('viewing thread still accepts envelope into base', () => {
    viewingUserChatId.current = 'chat-dm';
    let state = createInitialUnreadProjectionState();
    state = reduceUnreadProjection(
      state,
      {
        type: 'authorityEnvelopeReceived',
        resolvedKey: key,
        envelope: {
          contextType: 'USER',
          contextId: 'chat-dm',
          unreadCount: 2,
          contextKey: key,
          clock: { userUnreadRevision: 4, userContextUnreadRevision: 1 },
        },
      },
      phase4Config
    ).state;

    expect(state.baseByContext[key]).toBe(2);
    expect(state.displayedByContext[key]).toBeUndefined();
  });

  it('mark-read overlap: bump then clear keeps display at 0 after envelope', () => {
    let state = createInitialUnreadProjectionState();
    state = reduceUnreadProjection(
      state,
      { type: 'inboundMessageSeen', contextKey: key, messageId: 'm1', senderId },
      phase4Config
    ).state;
    expect(state.displayedByContext[key]).toBe(1);

    state = reduceUnreadProjection(
      state,
      { type: 'markReadRequested', contextKey: key, clientOpId: 'op-1' },
      phase4Config
    ).state;
    expect(state.displayedByContext[key]).toBeUndefined();

    state = reduceUnreadProjection(
      state,
      {
        type: 'authorityEnvelopeReceived',
        resolvedKey: key,
        envelope: {
          contextType: 'USER',
          contextId: 'chat-dm',
          unreadCount: 0,
          contextKey: key,
          clock: { userUnreadRevision: 6, userContextUnreadRevision: 3 },
          clientOpId: 'op-1',
        },
      },
      phase4Config
    ).state;

    expect(state.baseByContext[key]).toBeUndefined();
    expect(state.displayedByContext[key]).toBeUndefined();
  });

  it('dedupes same message id on replay', () => {
    const state = createInitialUnreadProjectionState();
    const first = reduceUnreadProjection(
      state,
      { type: 'inboundMessageSeen', contextKey: key, messageId: 'm1', senderId },
      phase4Config
    ).state;
    const second = reduceUnreadProjection(
      first,
      { type: 'inboundMessageSeen', contextKey: key, messageId: 'm1', senderId },
      phase4Config
    ).state;

    expect(second.displayedByContext[key]).toBe(1);
    const bump = second.optimistic[key];
    expect(bump?.type === 'bump' && bump.pendingCount).toBe(1);
  });
});
