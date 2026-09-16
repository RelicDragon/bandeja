import { describe, expect, it } from 'vitest';
import { buildDisplayedGameListingSharePayload } from './shareDisplayedGameListing';

describe('buildDisplayedGameListingSharePayload', () => {
  it('uses displayed name and description with the game link', () => {
    const payload = buildDisplayedGameListingSharePayload({
      name: 'Domingo social',
      description: 'Trae pelotas',
      url: 'https://bandeja.me/games/1',
    });
    expect(payload.title).toBe('Domingo social');
    expect(payload.text).toBe('Trae pelotas\nhttps://bandeja.me/games/1');
    expect(payload.clipboardText).toBe(
      'Domingo social\nTrae pelotas\nhttps://bandeja.me/games/1',
    );
  });

  it('falls back to name in text when description is empty', () => {
    const payload = buildDisplayedGameListingSharePayload({
      name: '  Original title  ',
      description: '   ',
      url: 'https://bandeja.me/games/2',
    });
    expect(payload.title).toBe('Original title');
    expect(payload.text).toBe('Original title\nhttps://bandeja.me/games/2');
    expect(payload.clipboardText).toBe('Original title\nhttps://bandeja.me/games/2');
  });

  it('works with link only when display fields are empty', () => {
    const payload = buildDisplayedGameListingSharePayload({
      name: null,
      description: null,
      url: 'https://bandeja.me/games/3',
    });
    expect(payload.title).toBeUndefined();
    expect(payload.text).toBe('https://bandeja.me/games/3');
    expect(payload.clipboardText).toBe('https://bandeja.me/games/3');
  });
});
