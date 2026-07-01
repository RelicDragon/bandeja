import { describe, expect, it, vi } from 'vitest';

const refreshAllMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/store/unreadStore', () => ({
  useUnreadStore: {
    getState: () => ({
      refreshAll: refreshAllMock,
    }),
  },
}));

describe('chatApi.invalidateUnreadCache (Phase 0 #233)', () => {
  it('does not trigger unread store refreshAll', async () => {
    const { chatApi } = await import('@/api/chat');
    refreshAllMock.mockClear();

    chatApi.invalidateUnreadCache();

    expect(refreshAllMock).not.toHaveBeenCalled();
  });
});
