import { describe, expect, it } from 'vitest';
import { resolveGamePreviewUrls } from './gamePreviewUrls';

describe('resolveGamePreviewUrls', () => {
  it.each(['game', 'gameChat', 'gameLive'] as const)(
    'normalizes %s previews to game and chat destinations',
    (entityType) => {
      expect(
        resolveGamePreviewUrls('https://bandeja.me/games/game-1/chat', entityType)
      ).toEqual({
        gameUrl: 'https://bandeja.me/games/game-1',
        chatUrl: 'https://bandeja.me/games/game-1/chat',
      });
    }
  );

  it('ignores non-game previews', () => {
    expect(resolveGamePreviewUrls('https://bandeja.me/group-chat/group-1', 'group')).toBeNull();
  });
});
