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
  it('keeps the saved payment hint when the socket payload omits it', () => {
    // The exact regression: a player leaves, the backend broadcasts a payload
    // projected for the least-entitled recipient (no `paymentHint`), and the
    // organizer's screen replaces its game wholesale. Before this helper her
    // IBAN vanished from state and the next save wrote `null` to the database.
    const previous = game({
      paymentHint: 'IBAN RS35 1234 5678',
      paymentMethods: [{ method: 'IBAN', handle: 'RS35 1234 5678' }],
      name: 'Friday doubles',
    });
    const incoming = game({ name: 'Friday doubles (moved)' });

    const merged = preserveUntransmittedGameFields(previous, incoming);

    expect(merged.paymentHint).toBe('IBAN RS35 1234 5678');
    expect(merged.paymentMethods).toEqual([{ method: 'IBAN', handle: 'RS35 1234 5678' }]);
    expect(merged.name).toBe('Friday doubles (moved)');
  });

  it('carries every untransmitted key, so the list and the merge cannot drift', () => {
    const previous = game({
      paymentHint: 'Revolut @organizer',
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
      paymentHint: 'IBAN RS35 1234 5678',
      paymentMethods: [{ method: 'IBAN', handle: 'RS35 1234 5678' }],
      isClubFavorite: true,
    });
    const incoming = game({ paymentHint: null, paymentMethods: null, isClubFavorite: false });

    const merged = preserveUntransmittedGameFields(previous, incoming);

    expect(merged.paymentHint).toBeNull();
    expect(merged.paymentMethods).toBeNull();
    expect(merged.isClubFavorite).toBe(false);
  });

  it('returns the incoming object untouched when there is nothing to carry', () => {
    const incoming = game({ name: 'n' });

    expect(preserveUntransmittedGameFields(null, incoming)).toBe(incoming);
    expect(preserveUntransmittedGameFields(game({}), incoming)).toBe(incoming);
  });

  it('does not mutate either input', () => {
    const previous = game({ paymentHint: 'IBAN RS35 1234 5678' });
    const incoming = game({ name: 'n' });

    preserveUntransmittedGameFields(previous, incoming);

    expect('paymentHint' in incoming).toBe(false);
    expect(previous.paymentHint).toBe('IBAN RS35 1234 5678');
  });
});
