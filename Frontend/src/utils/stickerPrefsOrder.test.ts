import { describe, expect, it } from 'vitest';
import {
  MAX_STICKER_FAVORITES,
  MAX_STICKER_RECENT,
  bumpStickerRecentIds,
  mergeRecentPrefs,
  mergeServerStickerPrefs,
  toggleStickerFavoriteIds,
} from './stickerPrefsOrder';

describe('bumpStickerRecentIds', () => {
  it('moves sticker to front and dedupes', () => {
    expect(bumpStickerRecentIds(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it('caps at MAX_STICKER_RECENT', () => {
    const ids = Array.from({ length: MAX_STICKER_RECENT }, (_, i) => `r${i}`);
    const next = bumpStickerRecentIds(ids, 'new');
    expect(next).toHaveLength(MAX_STICKER_RECENT);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(`r${MAX_STICKER_RECENT - 1}`);
  });
});

describe('mergeRecentPrefs', () => {
  it('keeps optimistic head until server includes it', () => {
    expect(mergeRecentPrefs(['new', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['new', 'a', 'b', 'c']);
  });

  it('defers to server once id is present', () => {
    expect(mergeRecentPrefs(['a', 'b'], ['new', 'a', 'b'])).toEqual(['new', 'a', 'b']);
  });

  it('applies multiple pending heads in local order', () => {
    expect(mergeRecentPrefs(['n1', 'n2', 'a'], ['a', 'b'])).toEqual(['n1', 'n2', 'a', 'b']);
  });
});

describe('mergeServerStickerPrefs', () => {
  it('takes server favorites and preserves optimistic recent head', () => {
    expect(
      mergeServerStickerPrefs(
        { favorites: ['f1'], recent: ['a', 'b'] },
        ['pending', 'a', 'b']
      )
    ).toEqual({ favorites: ['f1'], recent: ['pending', 'a', 'b'] });
  });
});

describe('cap parity with backend', () => {
  it('matches Backend stickerConstants (100 / 40)', () => {
    expect(MAX_STICKER_FAVORITES).toBe(100);
    expect(MAX_STICKER_RECENT).toBe(40);
  });
});

describe('toggleStickerFavoriteIds', () => {
  it('adds to front when favoriting', () => {
    expect(toggleStickerFavoriteIds(['a', 'b'], 'c')).toEqual({
      favorites: ['c', 'a', 'b'],
      isFavorite: true,
    });
  });

  it('removes when unfavoriting', () => {
    expect(toggleStickerFavoriteIds(['a', 'b', 'c'], 'b')).toEqual({
      favorites: ['a', 'c'],
      isFavorite: false,
    });
  });

  it('caps favorites at MAX_STICKER_FAVORITES', () => {
    const ids = Array.from({ length: MAX_STICKER_FAVORITES }, (_, i) => `f${i}`);
    const { favorites, isFavorite } = toggleStickerFavoriteIds(ids, 'new');
    expect(isFavorite).toBe(true);
    expect(favorites).toHaveLength(MAX_STICKER_FAVORITES);
    expect(favorites[0]).toBe('new');
    expect(favorites).not.toContain(`f${MAX_STICKER_FAVORITES - 1}`);
  });
});
