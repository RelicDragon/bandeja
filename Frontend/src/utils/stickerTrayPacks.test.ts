import { describe, expect, it } from 'vitest';
import type { StickerDto, StickerPackListItem } from '@/api/stickers';
import {
  filterStickersByQuery,
  sortPacksForSport,
  stickerMatchesQuery,
} from './stickerTrayPacks';

function pack(
  partial: Partial<StickerPackListItem> &
    Pick<StickerPackListItem, 'id' | 'slug' | 'sport' | 'sortOrder'>
): StickerPackListItem {
  return {
    title: partial.slug,
    locale: null,
    isOfficial: true,
    ownerUserId: null,
    stickerCount: 1,
    coverSticker: null,
    ...partial,
  };
}

function sticker(partial: Partial<StickerDto> & Pick<StickerDto, 'id'>): StickerDto {
  return {
    packId: 'p',
    emoji: '🎾',
    title: null,
    staticUrl: '/x.webp',
    animatedUrl: null,
    width: 512,
    height: 512,
    sortOrder: 0,
    ...partial,
  };
}

describe('sortPacksForSport', () => {
  it('orders by sortOrder when sport is absent (stable catalog default)', () => {
    const packs = [
      pack({ id: 'p', slug: 'padel', sport: 'PADEL', sortOrder: 2 }),
      pack({ id: 't', slug: 'tennis', sport: 'TENNIS', sortOrder: 0 }),
      pack({ id: 'r', slug: 'reactions', sport: null, sortOrder: 1 }),
    ];
    expect(sortPacksForSport(packs, null).map((p) => p.slug)).toEqual([
      'tennis',
      'reactions',
      'padel',
    ]);
    expect(sortPacksForSport(packs, undefined).map((p) => p.slug)).toEqual([
      'tennis',
      'reactions',
      'padel',
    ]);
  });

  it('prioritizes matching sport then general then others', () => {
    const packs = [
      pack({ id: 'r', slug: 'reactions', sport: null, sortOrder: 0 }),
      pack({ id: 't', slug: 'tennis', sport: 'TENNIS', sortOrder: 1 }),
      pack({ id: 'pb', slug: 'padel-b', sport: 'PADEL', sortOrder: 5 }),
      pack({ id: 'pa', slug: 'padel-a', sport: 'PADEL', sortOrder: 2 }),
    ];
    expect(sortPacksForSport(packs, 'PADEL').map((p) => p.slug)).toEqual([
      'padel-a',
      'padel-b',
      'reactions',
      'tennis',
    ]);
  });

  it('keeps personal packs ahead of official sport packs', () => {
    const packs = [
      pack({ id: 'r', slug: 'reactions', sport: null, sortOrder: 0 }),
      pack({
        id: 'mine',
        slug: 'mine',
        sport: null,
        sortOrder: -100,
        isOfficial: false,
        ownerUserId: 'u1',
      }),
      pack({ id: 'p', slug: 'padel', sport: 'PADEL', sortOrder: 1 }),
    ];
    expect(sortPacksForSport(packs, 'PADEL').map((p) => p.slug)).toEqual([
      'mine',
      'padel',
      'reactions',
    ]);
    // CH-123 still holds: padel before reactions
    const withoutPersonal = sortPacksForSport(packs, 'PADEL').filter((p) => p.slug !== 'mine');
    expect(withoutPersonal.map((p) => p.slug)).toEqual(['padel', 'reactions']);
  });
});

describe('stickerMatchesQuery / filterStickersByQuery', () => {
  it('matches title case-insensitively', () => {
    expect(stickerMatchesQuery(sticker({ id: '1', title: 'Smash Winner' }), 'smash')).toBe(true);
    expect(stickerMatchesQuery(sticker({ id: '1', title: 'Smash Winner' }), 'SMASH')).toBe(true);
  });

  it('matches emoji and slug', () => {
    expect(stickerMatchesQuery(sticker({ id: '1', emoji: '🔥' }), '🔥')).toBe(true);
    expect(stickerMatchesQuery(sticker({ id: '1', slug: 'high-five' }), 'high')).toBe(true);
  });

  it('hit returns matches; miss returns empty', () => {
    const catalog = [
      sticker({ id: '1', title: 'Smash', slug: 'smash' }),
      sticker({ id: '2', title: 'Lob', slug: 'lob' }),
      sticker({ id: '1-dup', title: 'Smash again', slug: 'smash-2' }),
    ];
    expect(filterStickersByQuery(catalog, 'smash').map((s) => s.id)).toEqual(['1', '1-dup']);
    expect(filterStickersByQuery(catalog, 'zzz-nope')).toEqual([]);
    expect(filterStickersByQuery(catalog, '   ')).toEqual([]);
  });
});
