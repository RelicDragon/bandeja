import { describe, it, expect } from 'vitest';
import type { Game } from '@/types';
import {
  GAME_SOCKET_UNTRANSMITTED_KEYS,
  preserveUntransmittedGameFields,
} from './preserveUntransmittedGameFields';

function game(fields: Partial<Game>): Game {
  return { id: 'g1', participants: [], ...fields } as Game;
}

describe('preserveUntransmittedGameFields', () => {
  it('keeps the viewer-scoped fields when the socket payload omits them', () => {
    // A player leaves, the backend broadcasts a payload projected for the
    // least-entitled recipient (no `userNote`), and the screen replaces its
    // game wholesale. The viewer's own note must survive.
    const previous = game({
      userNote: 'bring the pink balls',
      name: 'Friday doubles',
    });
    const incoming = game({ name: 'Friday doubles (moved)' });

    const merged = preserveUntransmittedGameFields(previous, incoming);

    expect(merged.userNote).toBe('bring the pink balls');
    expect(merged.name).toBe('Friday doubles (moved)');
  });

  it('carries every untransmitted key, so the list and the merge cannot drift', () => {
    const previous = game({
      userNote: 'bring the pink balls',
      isClubFavorite: true,
    });
    const merged = preserveUntransmittedGameFields(previous, game({}));

    for (const key of GAME_SOCKET_UNTRANSMITTED_KEYS) {
      expect(merged[key]).toEqual(previous[key]);
    }
  });

  it('lets a transmitted value win, including an explicit null', () => {
    const previous = game({
      userNote: 'bring the pink balls',
      isClubFavorite: true,
    });
    const incoming = game({ userNote: null, isClubFavorite: false });

    const merged = preserveUntransmittedGameFields(previous, incoming);

    expect(merged.userNote).toBeNull();
    expect(merged.isClubFavorite).toBe(false);
  });

  it('returns the incoming object untouched when there is nothing to carry', () => {
    const incoming = game({ name: 'n' });

    expect(preserveUntransmittedGameFields(null, incoming)).toBe(incoming);
    expect(preserveUntransmittedGameFields(game({}), incoming)).toBe(incoming);
  });

  it('does not mutate either input', () => {
    const previous = game({ userNote: 'bring the pink balls' });
    const incoming = game({ name: 'n' });

    preserveUntransmittedGameFields(previous, incoming);

    expect('userNote' in incoming).toBe(false);
    expect(previous.userNote).toBe('bring the pink balls');
  });
});
