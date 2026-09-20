import { describe, expect, it } from 'vitest';
import type { RecapSlide } from '@/api/recap';
import {
  canShareSelection,
  defaultSharedSlideKeys,
  initialSharedSlideKeys,
  toggleSharedSlideKey,
} from './recapShareSelection';

const SLIDES: RecapSlide[] = [
  { key: 'cover', kind: 'COVER', sport: null, sensitive: false },
  { key: 'games:PADEL', kind: 'GAMES', sport: 'PADEL', sensitive: false },
  { key: 'wins:PADEL', kind: 'WINS', sport: 'PADEL', sensitive: false },
  { key: 'level:PADEL', kind: 'LEVEL', sport: 'PADEL', sensitive: true },
  { key: 'club:PADEL', kind: 'CLUB', sport: 'PADEL', sensitive: false },
];

describe('defaultSharedSlideKeys', () => {
  it('ticks everything except the level drop', () => {
    expect(defaultSharedSlideKeys(SLIDES)).toEqual([
      'cover',
      'games:PADEL',
      'wins:PADEL',
      'club:PADEL',
    ]);
  });

  it('ticks the level slide when it is not a drop', () => {
    const rising = SLIDES.map((slide) =>
      slide.kind === 'LEVEL' ? { ...slide, sensitive: false } : slide,
    );
    expect(defaultSharedSlideKeys(rising)).toContain('level:PADEL');
  });
});

describe('initialSharedSlideKeys', () => {
  it('falls back to the defaults on a recap that was never shared', () => {
    expect(initialSharedSlideKeys(SLIDES, [])).toEqual(defaultSharedSlideKeys(SLIDES));
  });

  it('restores a previous share', () => {
    expect(initialSharedSlideKeys(SLIDES, ['cover', 'level:PADEL'])).toEqual([
      'cover',
      'level:PADEL',
    ]);
  });

  it('ignores slide keys that no longer exist in the payload', () => {
    expect(initialSharedSlideKeys(SLIDES, ['cover', 'partner:TENNIS'])).toEqual(['cover']);
  });

  it('falls back to the defaults when nothing restorable is left', () => {
    expect(initialSharedSlideKeys(SLIDES, ['partner:TENNIS'])).toEqual(
      defaultSharedSlideKeys(SLIDES),
    );
  });
});

describe('toggleSharedSlideKey', () => {
  it('adds in payload order, not click order', () => {
    const afterFirst = toggleSharedSlideKey(SLIDES, [], 'club:PADEL');
    const afterSecond = toggleSharedSlideKey(SLIDES, afterFirst, 'cover');
    expect(afterSecond).toEqual(['cover', 'club:PADEL']);
  });

  it('removes a ticked slide', () => {
    expect(toggleSharedSlideKey(SLIDES, ['cover', 'club:PADEL'], 'cover')).toEqual(['club:PADEL']);
  });

  it('lets the user opt a level drop back in', () => {
    expect(toggleSharedSlideKey(SLIDES, ['cover'], 'level:PADEL')).toEqual([
      'cover',
      'level:PADEL',
    ]);
  });
});

describe('canShareSelection', () => {
  it('blocks an empty share', () => {
    expect(canShareSelection([])).toBe(false);
    expect(canShareSelection(['cover'])).toBe(true);
  });
});
