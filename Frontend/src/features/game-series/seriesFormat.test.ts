import { describe, expect, it } from 'vitest';
import {
  cadenceLabelKey,
  cadencePillKey,
  dayKeyInTimeZone,
  firstWeekdayForLocale,
  formatDayKey,
  formatDayMonth,
  formatLocalTime,
  formatShortDate,
  formatWeekdayName,
  isoWeekdayInTimeZone,
  localTimeInTimeZone,
  repeatSummaryKey,
  resolveLocale,
  weekdayOrderForLocale,
} from './seriesFormat';
import type { Game } from '@/types';
import type { SeriesRegular } from '@/api/series';
import {
  seriesRegularAction,
  seriesRegularCandidates,
  seriesRegularName,
} from './seriesRosterActions';

/**
 * PRD 345 — no weekday name and no date order is ever hard-coded, so these
 * assertions check the *shape* the locale produces rather than an English
 * string. The ones that do pin a literal use `en-GB`-stable formats only.
 */

describe('seriesFormat — weekdays', () => {
  it('maps ISO weekdays to real weekday names', () => {
    expect(formatWeekdayName(1, 'en')).toBe('Monday');
    expect(formatWeekdayName(2, 'en')).toBe('Tuesday');
    expect(formatWeekdayName(7, 'en')).toBe('Sunday');
    expect(formatWeekdayName(2, 'en', 'short')).toBe('Tue');
  });

  it('clamps an out-of-range weekday instead of producing an invalid date', () => {
    expect(formatWeekdayName(0, 'en')).toBe('Monday');
    expect(formatWeekdayName(99, 'en')).toBe('Sunday');
  });

  it('localizes the weekday name rather than translating it in the app', () => {
    const ru = formatWeekdayName(2, 'ru');
    expect(ru).not.toBe('Tuesday');
    expect(ru.length).toBeGreaterThan(0);
  });

  it('treats `sr` as Serbian Latin, matching the app bundle', () => {
    expect(resolveLocale('sr')).toBe('sr-Latn');
    // Latin script: no Cyrillic code points.
    expect(formatWeekdayName(1, 'sr')).not.toMatch(/[Ѐ-ӿ]/);
  });
});

describe('seriesFormat — week start', () => {
  it('returns an ISO weekday in range for every app locale', () => {
    for (const locale of ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja']) {
      const first = firstWeekdayForLocale(locale);
      expect(first).toBeGreaterThanOrEqual(1);
      expect(first).toBeLessThanOrEqual(7);
    }
  });

  it('rotates the chip order so the locale week start comes first', () => {
    for (const locale of ['en', 'ru', 'ar', 'ja']) {
      const order = weekdayOrderForLocale(locale);
      expect(order).toHaveLength(7);
      expect(new Set(order).size).toBe(7);
      expect(order[0]).toBe(firstWeekdayForLocale(locale));
    }
  });

  it('falls back to Monday for a nonsense locale instead of throwing', () => {
    expect(firstWeekdayForLocale('not a locale!!')).toBe(1);
    expect(weekdayOrderForLocale('not a locale!!')[0]).toBe(1);
  });
});

describe('seriesFormat — copy keys', () => {
  it('maps the cadence to its own key set', () => {
    expect(cadenceLabelKey('WEEKLY')).toBe('series.cadenceWeekly');
    expect(cadenceLabelKey('BIWEEKLY')).toBe('series.cadenceBiweekly');
    expect(cadencePillKey('WEEKLY')).toBe('series.pillWeekly');
    expect(cadencePillKey('BIWEEKLY')).toBe('series.pillBiweekly');
    expect(repeatSummaryKey('WEEKLY')).toBe('series.repeatSummaryWeekly');
    expect(repeatSummaryKey('BIWEEKLY')).toBe('series.repeatSummaryBiweekly');
  });
});

describe('seriesFormat — dates and times', () => {
  it('renders a club-local HH:mm in the locale, not as raw text', () => {
    expect(formatLocalTime('19:00', 'en-GB')).toBe('19:00');
    // 12-hour locales must not be forced to 24h.
    expect(formatLocalTime('19:00', 'en-US')).toMatch(/7/);
    // Garbage in, garbage out — but never a crash or an "Invalid Date".
    expect(formatLocalTime('7pm', 'en')).toBe('7pm');
    expect(formatLocalTime('', 'en')).toBe('');
  });

  it('formats a day key without timezone drift', () => {
    // 2026-09-22 is a Tuesday. A naive `new Date('2026-09-22')` in a negative
    // UTC offset would render the 21st — this must not.
    expect(formatDayKey('2026-09-22', 'en-GB')).toContain('22');
    expect(formatDayKey('2026-09-22', 'en-GB')).toContain('Tue');
    expect(formatDayKey('2026-09-22', 'en-GB', 'dayMonth')).not.toContain('Tue');
    expect(formatDayKey('nope', 'en')).toBe('nope');
  });

  it('formats instants in the club timezone when one is given', () => {
    const instant = '2026-09-21T22:30:00.000Z';
    expect(formatShortDate(instant, { locale: 'en-GB', timeZone: 'Asia/Bangkok' })).toContain('22');
    expect(formatShortDate(instant, { locale: 'en-GB', timeZone: 'UTC' })).toContain('21');
    expect(formatDayMonth(instant, { locale: 'en-GB', timeZone: 'UTC' })).toContain('Sep');
  });

  it('returns an empty string for an unparseable instant', () => {
    expect(formatShortDate('not-a-date', { locale: 'en' })).toBe('');
    expect(dayKeyInTimeZone('not-a-date')).toBe('');
    expect(localTimeInTimeZone('not-a-date')).toBe('');
  });
});

describe('seriesFormat — seeding the Repeat sheet from a game', () => {
  it('reads the club-local day, time and weekday of an instant', () => {
    // 22:30 UTC on Monday the 21st is already Tuesday the 22nd in Bangkok.
    const instant = '2026-09-21T22:30:00.000Z';
    expect(dayKeyInTimeZone(instant, 'Asia/Bangkok')).toBe('2026-09-22');
    expect(localTimeInTimeZone(instant, 'Asia/Bangkok')).toBe('05:30');
    expect(isoWeekdayInTimeZone(instant, 'Asia/Bangkok')).toBe(2);

    expect(dayKeyInTimeZone(instant, 'UTC')).toBe('2026-09-21');
    expect(isoWeekdayInTimeZone(instant, 'UTC')).toBe(1);
  });

  it('keeps the wall clock across a DST boundary in a club timezone', () => {
    // Europe/Belgrade springs forward 2026-03-29; 19:00 local stays 19:00.
    expect(localTimeInTimeZone('2026-03-24T18:00:00.000Z', 'Europe/Belgrade')).toBe('19:00');
    expect(localTimeInTimeZone('2026-03-31T17:00:00.000Z', 'Europe/Belgrade')).toBe('19:00');
    expect(isoWeekdayInTimeZone('2026-03-31T17:00:00.000Z', 'Europe/Belgrade')).toBe(2);
  });
});

/**
 * PRD 345, user story 18 — "not next week" is not "not tonight".
 *
 * The backend has always allowed a regular to remove themselves
 * (`gameSeriesAccess.ts` `canRemoveSeriesRegular`), but `SeriesPage` gated the
 * only control on `series.isOwner`, so nobody but the organizer could reach it.
 */
describe('seriesRegularAction', () => {
  it('lets a regular leave their own row', () => {
    expect(
      seriesRegularAction({
        isOwner: false,
        isEnded: false,
        viewerUserId: 'me',
        regularUserId: 'me',
      }),
    ).toBe('leave');
  });

  it('gives a plain regular nothing on somebody else\'s row', () => {
    expect(
      seriesRegularAction({
        isOwner: false,
        isEnded: false,
        viewerUserId: 'me',
        regularUserId: 'other',
      }),
    ).toBe('none');
  });

  it('keeps the organizer\'s remove control on other rows', () => {
    expect(
      seriesRegularAction({
        isOwner: true,
        isEnded: false,
        viewerUserId: 'owner',
        regularUserId: 'other',
      }),
    ).toBe('remove');
  });

  it('shows the organizer "leave", not "remove", on their own row', () => {
    expect(
      seriesRegularAction({
        isOwner: true,
        isEnded: false,
        viewerUserId: 'owner',
        regularUserId: 'owner',
      }),
    ).toBe('leave');
  });

  it('offers nothing once the series has ended', () => {
    expect(
      seriesRegularAction({
        isOwner: true,
        isEnded: true,
        viewerUserId: 'owner',
        regularUserId: 'owner',
      }),
    ).toBe('none');
    expect(
      seriesRegularAction({
        isOwner: false,
        isEnded: true,
        viewerUserId: 'me',
        regularUserId: 'me',
      }),
    ).toBe('none');
  });

  it('never acts on a row with no user, and never on a signed-out viewer', () => {
    expect(
      seriesRegularAction({
        isOwner: true,
        isEnded: false,
        viewerUserId: 'owner',
        regularUserId: null,
      }),
    ).toBe('none');
    expect(
      seriesRegularAction({
        isOwner: false,
        isEnded: false,
        viewerUserId: null,
        regularUserId: 'me',
      }),
    ).toBe('none');
  });
});

describe('seriesRegularCandidates', () => {
  const occurrence = (id: string, players: Array<[string, string]>): Game =>
    ({
      id,
      participants: players.map(([userId, status]) => ({
        userId,
        status,
        user: { id: userId, firstName: userId.toUpperCase(), lastName: null, avatar: null },
      })),
    }) as unknown as Game;

  const regular = (id: string): SeriesRegular =>
    ({ user: { id }, addedAt: '2026-01-01T00:00:00.000Z' }) as unknown as SeriesRegular;

  it('offers seated players who are not on the roster yet, deduped and in order', () => {
    const candidates = seriesRegularCandidates(
      [
        occurrence('g1', [
          ['alice', 'PLAYING'],
          ['bob', 'PLAYING'],
        ]),
        occurrence('g2', [
          ['bob', 'PLAYING'],
          ['carol', 'PLAYING'],
        ]),
      ],
      [regular('alice')],
    );
    expect(candidates.map((c) => c.id)).toEqual(['bob', 'carol']);
  });

  it('ignores queued, invited and non-playing rows', () => {
    const candidates = seriesRegularCandidates(
      [
        occurrence('g1', [
          ['queued', 'IN_QUEUE'],
          ['invited', 'INVITED'],
          ['trainer', 'NON_PLAYING'],
          ['seated', 'PLAYING'],
        ]),
      ],
      [],
    );
    expect(candidates.map((c) => c.id)).toEqual(['seated']);
  });

  it('returns nothing when everyone is already a regular', () => {
    expect(
      seriesRegularCandidates([occurrence('g1', [['alice', 'PLAYING']])], [regular('alice')]),
    ).toEqual([]);
  });
});

describe('seriesRegularName', () => {
  it('joins the parts and falls back rather than rendering an empty row', () => {
    expect(seriesRegularName({ firstName: 'Ada', lastName: 'Lovelace' }, 'fallback')).toBe(
      'Ada Lovelace',
    );
    expect(seriesRegularName({ firstName: 'Ada', lastName: null }, 'fallback')).toBe('Ada');
    expect(seriesRegularName({ firstName: null, lastName: null }, 'fallback')).toBe('fallback');
    expect(seriesRegularName(null, 'fallback')).toBe('fallback');
  });
});

