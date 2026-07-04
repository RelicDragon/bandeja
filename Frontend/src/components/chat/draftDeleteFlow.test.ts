import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteDraftMock, removeDraftMock, setDraftMock } = vi.hoisted(() => ({
  deleteDraftMock: vi.fn(),
  removeDraftMock: vi.fn(),
  setDraftMock: vi.fn(),
}));

vi.mock('@/api/chat', () => ({
  chatApi: {
    deleteDraft: deleteDraftMock,
  },
}));

vi.mock('@/services/draftStorage', () => ({
  draftStorage: {
    remove: removeDraftMock,
    set: setDraftMock,
  },
}));

import { deleteDraftFromComposer } from './draftDeleteFlow';

describe('deleteDraftFromComposer', () => {
  const fakeWindow = new EventTarget() as Window & typeof globalThis;

  beforeEach(() => {
    vi.stubGlobal('window', fakeWindow);
    deleteDraftMock.mockReset();
    removeDraftMock.mockReset();
    setDraftMock.mockReset();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('removes local draft only after remote delete succeeds', async () => {
    deleteDraftMock.mockResolvedValue(undefined);
    removeDraftMock.mockResolvedValue(undefined);

    const deleted = vi.fn();
    window.addEventListener('draft-deleted', deleted);

    try {
      await deleteDraftFromComposer({
        userId: 'user-1',
        contextType: 'GAME',
        contextId: 'game-1',
        chatType: 'PUBLIC',
        previousDraft: { content: 'draft text', mentionIds: ['u2'] },
      });
    } finally {
      window.removeEventListener('draft-deleted', deleted);
    }

    expect(deleteDraftMock).toHaveBeenCalledWith('GAME', 'game-1', 'PUBLIC');
    expect(removeDraftMock).toHaveBeenCalledWith('user-1', 'GAME', 'game-1', 'PUBLIC');
    expect(setDraftMock).not.toHaveBeenCalled();
    expect(deleted).toHaveBeenCalledTimes(1);
  });

  it('restores local draft when remote delete fails', async () => {
    const error = {
      response: {
        status: 403,
        data: { code: 'chat.threadArchived' },
      },
    };
    deleteDraftMock.mockRejectedValue(error);
    setDraftMock.mockResolvedValue(undefined);

    const updated = vi.fn();
    window.addEventListener('draft-updated', updated);

    try {
      await expect(
        deleteDraftFromComposer({
          userId: 'user-1',
          contextType: 'GAME',
          contextId: 'game-2',
          chatType: 'PUBLIC',
          previousDraft: { content: 'restore me', mentionIds: ['u3'] },
        })
      ).rejects.toBe(error);
    } finally {
      window.removeEventListener('draft-updated', updated);
    }

    expect(removeDraftMock).not.toHaveBeenCalled();
    expect(setDraftMock).toHaveBeenCalledWith(
      'user-1',
      'GAME',
      'game-2',
      'PUBLIC',
      'restore me',
      ['u3']
    );
    expect(updated).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite local storage when delete fails without previous draft snapshot', async () => {
    const error = new Error('network down');
    deleteDraftMock.mockRejectedValue(error);

    await expect(
      deleteDraftFromComposer({
        userId: 'user-1',
        contextType: 'GAME',
        contextId: 'game-3',
        chatType: 'PUBLIC',
        previousDraft: null,
      })
    ).rejects.toBe(error);

    expect(removeDraftMock).not.toHaveBeenCalled();
    expect(setDraftMock).not.toHaveBeenCalled();
  });
});
