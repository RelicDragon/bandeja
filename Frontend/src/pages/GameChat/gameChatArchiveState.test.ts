import { describe, expect, it } from 'vitest';
import { resolveLoadedGameChatArchiveState } from './gameChatArchiveState';

describe('gameChatArchiveState', () => {
  it('preserves archived state and meta when thread is locally archived', () => {
    const meta = {
      cancelledAt: '2026-07-04T07:28:00.000Z',
      cancelledByUser: null,
      chatArchived: true,
    } as const;

    expect(resolveLoadedGameChatArchiveState(true, meta)).toEqual({
      isGameChatArchived: true,
      archivedGameMeta: meta,
    });
  });

  it('clears archived state when thread is not locally archived', () => {
    expect(
      resolveLoadedGameChatArchiveState(true, {
        cancelledAt: '2026-07-04T07:28:00.000Z',
        cancelledByUser: null,
        chatArchived: true,
      })
    ).toEqual(
      expect.objectContaining({
        isGameChatArchived: true,
      })
    );

    expect(
      resolveLoadedGameChatArchiveState(false, {
        cancelledAt: '2026-07-04T07:28:00.000Z',
        cancelledByUser: null,
        chatArchived: true,
      })
    ).toEqual({
      isGameChatArchived: false,
      archivedGameMeta: null,
    });
  });
});
