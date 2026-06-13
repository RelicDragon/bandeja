import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMissedMessagesMock = vi.fn();
const applyThreadEventMock = vi.fn();
const purgeGameChatLocalMock = vi.fn();

vi.mock('@/api/chat', () => ({
  chatApi: {
    getMissedMessages: (...args: unknown[]) => getMissedMessagesMock(...args),
  },
}));

vi.mock('@/services/chat/chatLocalApplyStoreBridge', () => ({
  bridgeGetLastMessageId: vi.fn(() => null),
}));

vi.mock('@/services/chat/messageContextHead', () => ({
  hydrateLastMessageIdFromDexieIfMissing: vi.fn(async () => {}),
}));

vi.mock('@/services/chat/chatLocalApplyThreadEvent', () => ({
  applyThreadEvent: (...args: unknown[]) => applyThreadEventMock(...args),
}));

vi.mock('@/services/chat/purgeGameChatLocal', () => ({
  purgeGameChatLocal: (...args: unknown[]) => purgeGameChatLocalMock(...args),
  isGameChatContextGoneHttpError: (error: unknown) => {
    const err = error as { response?: { status?: number; data?: { cancelled?: boolean } } };
    return err.response?.status === 404;
  },
}));

import { pullMissedAndPersistToDexie } from '@/services/chat/chatThreadNetworkSync';

describe('pullMissedAndPersistToDexie', () => {
  beforeEach(() => {
    getMissedMessagesMock.mockReset();
    applyThreadEventMock.mockReset();
    purgeGameChatLocalMock.mockReset();
  });

  it('purges local game chat when server marks thread invalidated', async () => {
    getMissedMessagesMock.mockResolvedValue({ messages: [], threadInvalidated: true });

    const out = await pullMissedAndPersistToDexie({
      contextType: 'GAME',
      contextId: 'game-1',
      gameChatType: 'PUBLIC',
    });

    expect(out).toEqual([]);
    expect(purgeGameChatLocalMock).toHaveBeenCalledWith('game-1');
    expect(applyThreadEventMock).not.toHaveBeenCalled();
  });

  it('purges local game chat on 404 from missed pull', async () => {
    getMissedMessagesMock.mockRejectedValue({ response: { status: 404 } });

    const out = await pullMissedAndPersistToDexie({
      contextType: 'GAME',
      contextId: 'game-2',
    });

    expect(out).toEqual([]);
    expect(purgeGameChatLocalMock).toHaveBeenCalledWith('game-2');
  });

  it('persists returned messages without purge', async () => {
    const msg = { id: 'm1', chatContextType: 'GAME', contextId: 'game-3' };
    getMissedMessagesMock.mockResolvedValue({ messages: [msg] });

    const out = await pullMissedAndPersistToDexie({
      contextType: 'USER',
      contextId: 'u1',
    });

    expect(out).toEqual([msg]);
    expect(purgeGameChatLocalMock).not.toHaveBeenCalled();
    expect(applyThreadEventMock).toHaveBeenCalledWith({ kind: 'httpMessages', messages: [msg] });
  });
});
