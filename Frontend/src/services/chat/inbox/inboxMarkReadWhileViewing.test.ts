import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Game } from '@/types';
import { bugsApi } from '@/api/bugs';
import { buildGameChatMarkReadParams } from '@/services/chat/gameChatMarkReadParams';
import { markContextReadOnUserActivity } from '@/services/chat/unreadCoordinator';
import { markInboxContextReadWhileViewing } from './inboxMarkReadWhileViewing';

const { patchGroupChannelMeta } = vi.hoisted(() => ({
  patchGroupChannelMeta: vi.fn(),
}));

vi.mock('@/services/chat/unreadCoordinator', () => ({
  markContextReadOnUserActivity: vi.fn(),
}));

vi.mock('@/services/chat/gameChatMarkReadParams', () => ({
  buildGameChatMarkReadParams: vi.fn(),
}));

vi.mock('@/api/bugs', () => ({
  bugsApi: { getBugById: vi.fn() },
}));

vi.mock('@/store/unreadStore', () => ({
  useUnreadStore: {
    getState: () => ({ groupChannelMeta: {}, patchGroupChannelMeta }),
  },
}));

describe('markInboxContextReadWhileViewing', () => {
  beforeEach(() => {
    vi.mocked(markContextReadOnUserActivity).mockClear();
    vi.mocked(buildGameChatMarkReadParams).mockReset();
    vi.mocked(bugsApi.getBugById).mockReset();
    patchGroupChannelMeta.mockClear();
  });

  it('passes game row data for desktop GAME mark-read', () => {
    const game = {
      id: 'g1',
      status: 'SCHEDULED',
      isPublic: true,
      participants: [{ userId: 'u1', status: 'PLAYING', role: 'OWNER' }],
    } as Game;
    vi.mocked(buildGameChatMarkReadParams).mockReturnValue({
      contextType: 'GAME',
      contextId: 'g1',
      rawContextType: 'GAME',
      game: { id: 'g1', status: 'SCHEDULED' },
      participant: { status: 'PLAYING', role: 'OWNER' },
      parentParticipant: null,
      gameChatType: 'PUBLIC',
    });

    markInboxContextReadWhileViewing(
      'GAME',
      'g1',
      [{ type: 'game', data: game, lastMessageDate: null, unreadCount: 2 }],
      'u1'
    );

    expect(buildGameChatMarkReadParams).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'g1', game, userId: 'u1' })
    );
    expect(markContextReadOnUserActivity).toHaveBeenCalledWith(
      expect.objectContaining({ forceMarkReadNetwork: true })
    );
  });

  it('fetches bug channel on cold start then marks read', async () => {
    vi.mocked(bugsApi.getBugById).mockResolvedValue({
      data: { id: 'b1', groupChannel: { id: 'ch-b1' } },
    } as Awaited<ReturnType<typeof bugsApi.getBugById>>);

    markInboxContextReadWhileViewing('BUG', 'b1', [], 'u1');

    await vi.waitFor(() => {
      expect(bugsApi.getBugById).toHaveBeenCalledWith('b1');
    });
    await vi.waitFor(() => {
      expect(patchGroupChannelMeta).toHaveBeenCalledWith('ch-b1', { bugId: 'b1', isChannel: true });
      expect(markContextReadOnUserActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          contextType: 'GROUP',
          contextId: 'ch-b1',
          rawContextType: 'BUG',
          forceMarkReadNetwork: true,
        })
      );
    });
  });
});
