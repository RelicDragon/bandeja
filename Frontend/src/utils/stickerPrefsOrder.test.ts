import { describe, expect, it } from 'vitest';
import {
  MAX_STICKER_FAVORITES,
  MAX_STICKER_RECENT,
  bumpChatMediaRecent,
  mergeRecentPrefs,
  mergeServerStickerPrefs,
  toggleStickerFavoriteIds,
} from './stickerPrefsOrder';

const sticker = (stickerId: string) => ({ kind: 'STICKER' as const, stickerId });
const gif = (id: string) => ({
  kind: 'GIF' as const,
  provider: 'GIPHY' as const,
  id,
  title: `GIF ${id}`,
  previewUrl: `https://media.giphy.com/${id}/preview.gif`,
  downloadUrl: `https://media.giphy.com/${id}/download.gif`,
  width: 200,
  height: 200,
});

describe('bumpChatMediaRecent', () => {
  it('moves sticker to front and dedupes', () => {
    expect(bumpChatMediaRecent([sticker('a'), sticker('b'), sticker('c')], sticker('b'))).toEqual([
      sticker('b'),
      sticker('a'),
      sticker('c'),
    ]);
  });

  it('caps at MAX_STICKER_RECENT', () => {
    const ids = Array.from({ length: MAX_STICKER_RECENT }, (_, i) => sticker(`r${i}`));
    const next = bumpChatMediaRecent(ids, sticker('new'));
    expect(next).toHaveLength(MAX_STICKER_RECENT);
    expect(next[0]).toEqual(sticker('new'));
    expect(next).not.toContainEqual(sticker(`r${MAX_STICKER_RECENT - 1}`));
  });

  it('keeps GIFs and stickers in one deduplicated MRU list', () => {
    expect(
      bumpChatMediaRecent([sticker('one'), gif('party'), sticker('two')], gif('party'))
    ).toEqual([gif('party'), sticker('one'), sticker('two')]);
  });
});

describe('mergeRecentPrefs', () => {
  it('keeps optimistic head until server includes it', () => {
    expect(
      mergeRecentPrefs(
        [sticker('new'), sticker('a'), sticker('b')],
        [sticker('a'), sticker('b'), sticker('c')]
      )
    ).toEqual([sticker('new'), sticker('a'), sticker('b'), sticker('c')]);
  });

  it('defers to server once id is present', () => {
    expect(
      mergeRecentPrefs(
        [sticker('a'), sticker('b')],
        [sticker('new'), sticker('a'), sticker('b')]
      )
    ).toEqual([sticker('new'), sticker('a'), sticker('b')]);
  });

  it('applies multiple pending heads in local order', () => {
    expect(
      mergeRecentPrefs(
        [sticker('n1'), sticker('n2'), sticker('a')],
        [sticker('a'), sticker('b')]
      )
    ).toEqual([sticker('n1'), sticker('n2'), sticker('a'), sticker('b')]);
  });
});

describe('mergeServerStickerPrefs', () => {
  it('takes server favorites and preserves optimistic recent head', () => {
    expect(
      mergeServerStickerPrefs(
        { favorites: ['f1'], recentMedia: [sticker('a'), sticker('b')] },
        [sticker('pending'), sticker('a'), sticker('b')]
      )
    ).toEqual({
      favorites: ['f1'],
      recentMedia: [sticker('pending'), sticker('a'), sticker('b')],
    });
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
