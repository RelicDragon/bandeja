/**
 * Club console time math without a database: opening hours past midnight and across DST,
 * weekly hold repeats at the same wall time across DST, occupancy de-duplication, cursors.
 */
import assert from 'node:assert/strict';
import { clubDayWindowUtc } from '@bandeja/shared/clubAdmin/clubTime';
import { parseHoursBody, resolveDayHours, weeklyFromRows, type ClubHoursSource } from '../clubAdminHours.service';
import { bookedCourtMinutes, occupancyPct } from '../clubAdminOccupancy';
import { weeklyOccurrences } from '../clubAdminHold.service';
import { decodeBookingsCursor, encodeBookingsCursor } from '../clubAdminBookings.service';

const TZ = 'Europe/Belgrade';

function source(weekly: ClubHoursSource['weekly'], closures: Array<{ date: string; open: number | null; close: number | null }> = []): ClubHoursSource {
  return {
    timezone: TZ,
    weekly,
    configured: true,
    closuresByDate: new Map(
      closures.map((c, i) => [c.date, { id: `c${i}`, date: c.date, openMinute: c.open, closeMinute: c.close, note: null }])
    ),
  };
}

const allWeek = (open: string, close: string) =>
  ([1, 2, 3, 4, 5, 6, 7] as const).map((weekday) => ({ weekday, closed: false, open, close }));

/* --- hours past midnight + DST ------------------------------------------------------------- */
{
  const src = source(allWeek('08:00', '01:00'));
  // 2026-10-25: EU DST ends at 03:00 local → the day is 25 h; 08:00 is CET (UTC+1).
  const h = resolveDayHours(src, '2026-10-25')!;
  assert.equal(h.openAt, '2026-10-25T07:00:00.000Z', 'open after fall-back is UTC+1');
  assert.equal(h.closeAt, '2026-10-26T00:00:00.000Z', 'close rolls into the next day');
  const fall = clubDayWindowUtc('2026-10-25', TZ);
  assert.equal(fall.end.getTime() - fall.start.getTime(), 25 * 3_600_000, '25-hour day');
  // 2026-03-29: DST starts → 23 h day; 08:00 is CEST (UTC+2).
  const spring = resolveDayHours(src, '2026-03-29')!;
  assert.equal(spring.openAt, '2026-03-29T06:00:00.000Z');
  assert.equal(spring.closeAt, '2026-03-29T23:00:00.000Z');
  const sw = clubDayWindowUtc('2026-03-29', TZ);
  assert.equal(sw.end.getTime() - sw.start.getTime(), 23 * 3_600_000, '23-hour day');
  // Midnight close means "until 24:00".
  const midnight = resolveDayHours(source(allWeek('09:00', '00:00')), '2026-06-01')!;
  assert.equal(new Date(midnight.closeAt).getTime() - new Date(midnight.openAt).getTime(), 15 * 3_600_000);
}

/* --- closures and weekly closed days ---------------------------------------------------------- */
{
  const weekly = allWeek('08:00', '22:00');
  weekly[6] = { weekday: 7, closed: true, open: '08:00', close: '22:00' };
  const src = source(weekly, [
    { date: '2026-12-25', open: null, close: null },
    { date: '2026-12-24', open: 10 * 60, close: 14 * 60 },
  ]);
  assert.equal(resolveDayHours(src, '2026-12-25'), null, 'closure closes the day');
  assert.equal(resolveDayHours(src, '2026-12-24')!.open, '10:00', 'special hours');
  assert.equal(resolveDayHours(src, '2026-12-27'), null, 'Sunday closed weekly');
  assert.equal(resolveDayHours(src, '2026-12-28')!.close, '22:00');
}

/* --- legacy fallback ---------------------------------------------------------------------------- */
{
  const legacy = weeklyFromRows([], { openingTime: '07:30', closingTime: '23:30' });
  assert.equal(legacy.configured, false);
  assert.ok(legacy.weekly.every((d) => !d.closed && d.open === '07:30' && d.close === '23:30'));
  const partial = weeklyFromRows([{ weekday: 1, closed: false, openMinute: 600, closeMinute: 1200 }], {
    openingTime: null,
    closingTime: null,
  });
  assert.equal(partial.weekly[0].open, '10:00');
  assert.equal(partial.weekly[1].closed, true, 'configured clubs: missing day = closed');
}

/* --- PUT /hours validation ---------------------------------------------------------------------- */
{
  assert.throws(() => parseHoursBody({ weekly: allWeek('08:00', '22:00').slice(0, 6) }), /weekly/);
  assert.throws(() => parseHoursBody({ weekly: allWeek('8:00', '22:00') }), /open/);
  const dup = allWeek('08:00', '22:00');
  dup[1] = { ...dup[1], weekday: 1 };
  assert.throws(() => parseHoursBody({ weekly: dup }), /weekday/);
  assert.throws(
    () => parseHoursBody({ weekly: allWeek('08:00', '22:00'), closures: [{ date: '2026-02-30', open: null, close: null, note: null }] }),
    /date/
  );
  assert.throws(
    () => parseHoursBody({ weekly: allWeek('08:00', '22:00'), closures: [{ date: '2026-02-03', open: '10:00', close: null, note: null }] }),
    /together/
  );
  const ok = parseHoursBody({ weekly: allWeek('08:00', '01:00'), closures: [{ date: '2026-02-03', open: null, close: null, note: ' x ' }] });
  assert.equal(ok.weekly[0].closeMinute, 60);
  assert.equal(ok.closures[0].note, 'x');
}

/* --- weekly repeats keep the wall time across DST ---------------------------------------------- */
{
  // 2026-10-18 19:00 CEST = 17:00Z; a week later is CET, so 19:00 = 18:00Z.
  const occ = weeklyOccurrences(new Date('2026-10-18T17:00:00Z'), new Date('2026-10-18T18:30:00Z'), 3, TZ);
  assert.deepEqual(
    occ.map((o) => [o.start.toISOString(), o.end.toISOString()]),
    [
      ['2026-10-18T17:00:00.000Z', '2026-10-18T18:30:00.000Z'],
      ['2026-10-25T18:00:00.000Z', '2026-10-25T19:30:00.000Z'],
      ['2026-11-01T18:00:00.000Z', '2026-11-01T19:30:00.000Z'],
    ]
  );
  // Past midnight: 23:00–01:00.
  const late = weeklyOccurrences(new Date('2026-06-01T21:00:00Z'), new Date('2026-06-01T23:00:00Z'), 2, TZ);
  assert.equal(late[1].end.getTime() - late[1].start.getTime(), 2 * 3_600_000);
}

/* --- occupancy: overlapping blocks on a court count once ---------------------------------------- */
{
  const t = (h: number) => new Date(Date.UTC(2026, 5, 1, h));
  const courts = new Set(['c1', 'c2']);
  const minutes = bookedCourtMinutes(
    [
      { courtId: 'c1', start: t(8), end: t(10) },
      { courtId: 'c1', start: t(9), end: t(11) }, // overlaps → 08–11 = 180
      { courtId: 'c1', start: t(11), end: t(12) }, // touching → 240
      { courtId: 'c2', start: t(6), end: t(9) }, // clipped to window → 60
      { courtId: 'c3', start: t(8), end: t(9) }, // inactive court ignored
    ],
    { start: t(8), end: t(20) },
    courts
  );
  assert.equal(minutes, 300);
  assert.equal(occupancyPct(300, 2 * 12 * 60), 20.8);
  assert.equal(occupancyPct(10, 0), 0);
}

/* --- cursors ---------------------------------------------------------------------------------- */
{
  const c = { scope: 'past' as const, t: '2026-06-01T10:00:00.000Z', id: 'hold:abc' };
  assert.deepEqual(decodeBookingsCursor(encodeBookingsCursor(c)), c);
  assert.throws(() => decodeBookingsCursor('not-a-cursor'), /cursor/);
}

console.log('clubAdminTime.test.ts: ok');
