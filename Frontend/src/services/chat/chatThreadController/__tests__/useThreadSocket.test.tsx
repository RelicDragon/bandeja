// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThreadSocket } from '../useThreadSocket';

const joinChatRoomMock = vi.fn(async () => {});
const leaveChatRoomMock = vi.fn();
const syncMessagesMock = vi.fn();
const setViewingGroupChannelIdMock = vi.fn();
const setViewingUserChatIdMock = vi.fn();
const setViewingGameChatMock = vi.fn();

const socketStoreState = {
  chatRoomPushSeq: {} as Record<string, number>,
  syncRequiredEpoch: 0,
  lastSyncRequired: null as null | { contextType: string; contextId: string },
  takeChatRoomQueue: vi.fn(() => []),
};

vi.mock('@/services/chat/chatThreadController/processChatRoomBatch', () => ({
  processChatRoomBatch: vi.fn(),
}));

vi.mock('@/services/socketService', () => ({
  socketService: {
    joinChatRoom: (...args: unknown[]) => joinChatRoomMock(...args),
    leaveChatRoom: (...args: unknown[]) => leaveChatRoomMock(...args),
    syncMessages: (...args: unknown[]) => syncMessagesMock(...args),
  },
}));

vi.mock('@/store/socketEventsStore', () => ({
  useSocketEventsStore: (selector: (state: typeof socketStoreState) => unknown) => selector(socketStoreState),
}));

vi.mock('@/store/chatSyncStore', () => ({
  useChatSyncStore: {
    getState: () => ({ isOpenSyncing: false, syncInProgress: false, setOpenSyncing: vi.fn() }),
    subscribe: vi.fn(() => () => {}),
  },
}));

vi.mock('@/components/GameDetails/gameDetailsChromeStore', () => ({
  useGameDetailsChromeStore: {
    getState: () => ({
      setViewingGroupChannelId: setViewingGroupChannelIdMock,
      setViewingUserChatId: setViewingUserChatIdMock,
      setViewingGameChat: setViewingGameChatMock,
    }),
  },
}));

vi.mock('@/services/chat/chatThreadController/useThreadSnapshotRevision', () => ({
  useThreadSnapshotRevision: () => 0,
}));

function TestHarness(props: {
  isLoadingContext: boolean;
  isGameChatArchived: boolean;
  isGameChatAccessDenied: boolean;
}) {
  useThreadSocket({
    id: 'game-1',
    contextType: 'GAME',
    effectiveChatType: 'PUBLIC',
    currentIdRef: { current: 'game-1' },
    userId: 'user-1',
    setMessages: vi.fn(),
    messagesRef: { current: [] },
    reloadMessagesFirstPage: vi.fn(),
    isLoadingContext: props.isLoadingContext,
    isGameChatArchived: props.isGameChatArchived,
    isGameChatAccessDenied: props.isGameChatAccessDenied,
  });
  return null;
}

describe('useThreadSocket archived reopen gating', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    joinChatRoomMock.mockClear();
    leaveChatRoomMock.mockClear();
    syncMessagesMock.mockClear();
    setViewingGroupChannelIdMock.mockClear();
    setViewingUserChatIdMock.mockClear();
    setViewingGameChatMock.mockClear();
    socketStoreState.takeChatRoomQueue.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('does not join while embedded game chat is still resolving', async () => {
    await act(async () => {
      root.render(
        <TestHarness
          isLoadingContext
          isGameChatArchived={false}
          isGameChatAccessDenied={false}
        />
      );
    });

    expect(joinChatRoomMock).not.toHaveBeenCalled();
  });

  it('does not join when reopen resolves as archived', async () => {
    await act(async () => {
      root.render(
        <TestHarness
          isLoadingContext
          isGameChatArchived={false}
          isGameChatAccessDenied={false}
        />
      );
    });

    await act(async () => {
      root.render(
        <TestHarness
          isLoadingContext={false}
          isGameChatArchived
          isGameChatAccessDenied={false}
        />
      );
    });

    expect(joinChatRoomMock).not.toHaveBeenCalled();
  });

  it('joins only after resolving as an active game thread', async () => {
    await act(async () => {
      root.render(
        <TestHarness
          isLoadingContext
          isGameChatArchived={false}
          isGameChatAccessDenied={false}
        />
      );
    });

    await act(async () => {
      root.render(
        <TestHarness
          isLoadingContext={false}
          isGameChatArchived={false}
          isGameChatAccessDenied={false}
        />
      );
    });

    expect(joinChatRoomMock).toHaveBeenCalledOnce();
    expect(joinChatRoomMock).toHaveBeenCalledWith('GAME', 'game-1');
  });
});
