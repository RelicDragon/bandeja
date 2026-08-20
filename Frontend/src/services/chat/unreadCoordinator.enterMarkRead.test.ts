import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { contextKey } from '@/services/chat/unreadSnapshot';
import { createInitialUnreadProjectionState } from '@/services/chat/unreadProjection';

const markContextReadMock = vi.fn().mockResolvedValue({ data: {} });
const projection = {
  state: createInitialUnreadProjectionState(),
};

vi.mock('@/store/unreadStore', () => ({
  useUnreadStore: {
    getState: () => projection.state,
    setState: (next: typeof projection.state) => {
      projection.state = { ...projection.state, ...next };
    },
  },
}));

vi.mock('@/services/chat/unreadProjectionEffects', () => ({
  runUnreadProjectionEffects: vi.fn(),
}));

vi.mock('@/api/chat', () => ({
  chatApi: {
    markContextRead: (...args: unknown[]) => markContextReadMock(...args),
  },
}));

vi.mock('@/services/chat/offlineIntent', () => ({
  OfflineIntent: { enqueue: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/services/chat/chatMutationNetwork', () => ({
  shouldQueueChatMutation: () => false,
}));

vi.mock('@/utils/chatOpenIdle', () => ({
  scheduleChatOpenIdle: (fn: () => void) => fn(),
}));

vi.mock('@/services/push/dismissNativeChatTrayNotification', () => ({
  dismissNativeChatTrayNotification: vi.fn(),
}));

vi.mock('@/components/GameDetails/gameDetailsChromeStore', () => ({
  useGameDetailsChromeStore: {
    getState: () => ({
      setViewingUserChatId: vi.fn(),
      setViewingGroupChannelId: vi.fn(),
      setViewingGameChat: vi.fn(),
      viewingUserChatId: null,
      viewingGameChatId: null,
      viewingGroupChannelId: null,
    }),
  },
}));

vi.mock('@/services/chat/unreadViewingGuard', () => ({
  shouldSuppressUnreadForOpenContext: () => false,
}));

import { enterContextAndMarkRead, resetCoordinator } from '@/services/chat/unreadCoordinator';

describe('enterContextAndMarkRead (#326)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    markContextReadMock.mockClear();
    projection.state = createInitialUnreadProjectionState();
    resetCoordinator();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('still marks the server cursor when local unread is 0 and mark-read was already confirmed', async () => {
    const key = contextKey('USER', 'u1');
    projection.state = {
      ...projection.state,
      markReadConfirmedKeys: new Set([key]),
    };

    await enterContextAndMarkRead({ contextType: 'USER', contextId: 'u1' });
    await vi.runAllTimersAsync();

    expect(markContextReadMock).toHaveBeenCalled();
  });
});
