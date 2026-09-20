import { describe, expect, it } from 'vitest';
import { buildClubPath, deepLinkTemplatePath } from '@/deepLinks/catalog';
import { buildUrl, parseLocation } from '@/utils/urlSchema';
import { clubHeroScrollState, CLUB_HERO_COLLAPSE_PX } from './useClubPageScroll';

/** PRD 354 — `/clubs/:id` must round-trip through every routing surface. */
describe('club page route', () => {
  it('builds the same path from the deep-link catalog and the URL schema', () => {
    expect(buildClubPath('club-1')).toBe('/clubs/club-1');
    expect(deepLinkTemplatePath('club', 'club-1')).toBe('/clubs/club-1');
    expect(buildUrl('club', { id: 'club-1' })).toBe('/clubs/club-1');
  });

  it('parses to the `club` place with the id as a param', () => {
    const parsed = parseLocation('/clubs/club-1', '');
    expect(parsed.place).toBe('club');
    expect(parsed.params?.id).toBe('club-1');
  });

  it('does not swallow nested club routes', () => {
    expect(parseLocation('/clubs/club-1/reviews', '').place).not.toBe('club');
  });

  it('keeps the share query out of the place match', () => {
    expect(parseLocation('/clubs/club-1', '?ref=abc').place).toBe('club');
  });
});

/** The hero collapse and the parallax read from one measurement. */
describe('clubHeroScrollState', () => {
  it('is fully expanded at the top', () => {
    expect(clubHeroScrollState(0, false)).toEqual({ progress: 0, parallaxOffset: 0 });
  });

  it('reaches the sticky header at the collapse distance and clamps there', () => {
    expect(clubHeroScrollState(CLUB_HERO_COLLAPSE_PX, false).progress).toBe(1);
    expect(clubHeroScrollState(CLUB_HERO_COLLAPSE_PX * 4, false).progress).toBe(1);
  });

  it('moves the hero at 0.3x the scroll speed', () => {
    expect(clubHeroScrollState(100, false).parallaxOffset).toBeCloseTo(30);
  });

  it('has no parallax under reduced motion', () => {
    expect(clubHeroScrollState(400, true).parallaxOffset).toBe(0);
    // Progress still advances — the sticky header is not an animation.
    expect(clubHeroScrollState(400, true).progress).toBe(1);
  });

  it('ignores rubber-band overscroll above the top', () => {
    expect(clubHeroScrollState(-120, false)).toEqual({ progress: 0, parallaxOffset: 0 });
  });
});

/** "Updated 2 minutes ago" — PRD 354 §Today at a glance. */
describe('relativeUpdatedPhrase', () => {
  const now = Date.parse('2026-09-20T12:00:00.000Z');

  it('is null without a usable timestamp', async () => {
    const { relativeUpdatedPhrase } = await import('./clubTodayStripFormat');
    expect(relativeUpdatedPhrase(null, 'en', now)).toBeNull();
    expect(relativeUpdatedPhrase('not-a-date', 'en', now)).toBeNull();
  });

  it('is empty for "just now", so the caller can pick a different string', async () => {
    const { relativeUpdatedPhrase } = await import('./clubTodayStripFormat');
    expect(relativeUpdatedPhrase('2026-09-20T11:59:45.000Z', 'en', now)).toBe('');
  });

  it('formats minutes and hours per locale', async () => {
    const { relativeUpdatedPhrase } = await import('./clubTodayStripFormat');
    expect(relativeUpdatedPhrase('2026-09-20T11:58:00.000Z', 'en', now)).toBe('2 minutes ago');
    expect(relativeUpdatedPhrase('2026-09-20T09:00:00.000Z', 'en', now)).toBe('3 hours ago');
    expect(relativeUpdatedPhrase('2026-09-20T11:58:00.000Z', 'es', now)).not.toBe('2 minutes ago');
  });
});
