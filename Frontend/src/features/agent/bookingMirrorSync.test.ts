import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKING_MIRROR_DEBOUNCE_MS,
  BOOKING_MIRROR_MIN_INTERVAL_MS,
  createBookingMirrorSyncer,
  toBookingMirrorBody,
  type BookingMirrorBody,
  type BookingMirrorReport,
} from './bookingMirrorSync';

vi.mock('@/api/axios', () => ({ default: { put: vi.fn() } }));

const courts = [
  { id: 'court-1', name: 'Court 1', externalCourtId: 'ext-1' },
  { id: 'court-2', name: 'Court 2', externalCourtId: 'ext-2' },
];

function report(extra: Partial<BookingMirrorReport> = {}): BookingMirrorReport {
  return {
    provider: 'BOOKTIME',
    clubId: 'club-1',
    timeZone: 'Europe/Belgrade',
    courts,
    fetchedFrom: new Date('2026-10-01T08:00:00.000Z'),
    complete: true,
    bookings: [
      {
        uuid: 'b-1',
        bookingStart: '2026-10-02T18:00:00.000Z',
        bookingEnd: '2026-10-02T19:30:00.000Z',
        bookingResourceId: 'ext-1',
      },
    ],
    ...extra,
  };
}

describe('toBookingMirrorBody', () => {
  it('maps bookings to club courts, UTC instants and states', () => {
    const body = toBookingMirrorBody(report({
      bookings: [
        { uuid: 'b-1', bookingStart: '2026-10-02T18:00:00.000Z', bookingEnd: '2026-10-02T19:30:00.000Z', bookingResourceId: 'ext-1' },
        { uuid: 'b-2', bookingStart: '2026-10-03T18:00:00.000Z', bookingEnd: '2026-10-03T19:00:00.000Z', bookingResourceId: 'ext-2', status: 'CANCELLED' },
        { uuid: 'b-other', bookingStart: '2026-10-03T18:00:00.000Z', bookingEnd: '2026-10-03T19:00:00.000Z', bookingResourceId: 'ext-elsewhere' },
        { uuid: 'b-bad', bookingStart: '2026-10-03T19:00:00.000Z', bookingEnd: '2026-10-03T18:00:00.000Z', bookingResourceId: 'ext-1' },
      ],
    }));
    expect(body.complete).toBe(true);
    expect(body.rangeFrom).toBe('2026-10-01T08:00:00.000Z');
    expect(new Date(body.rangeTo).getTime()).toBeGreaterThan(new Date('2027-09-30T00:00:00Z').getTime());
    expect(body.bookings).toEqual([
      { externalBookingId: 'b-1', start: '2026-10-02T18:00:00.000Z', end: '2026-10-02T19:30:00.000Z', courts: [{ courtId: 'court-1', name: 'Court 1' }], state: 'CONFIRMED' },
      { externalBookingId: 'b-2', start: '2026-10-03T18:00:00.000Z', end: '2026-10-03T19:00:00.000Z', courts: [{ courtId: 'court-2', name: 'Court 2' }], state: 'CANCELLED' },
    ]);
  });

  it('a truncated page only claims the range it saw', () => {
    const body = toBookingMirrorBody(report({ complete: false }));
    expect(body.complete).toBe(false);
    expect(body.rangeTo).toBe('2026-10-02T18:00:00.000Z');
  });
});

describe('createBookingMirrorSyncer', () => {
  let clock = 0;
  let sent: BookingMirrorBody[] = [];
  let userId: string | null = 'user-1';
  const make = (send?: (body: BookingMirrorBody) => Promise<unknown>) =>
    createBookingMirrorSyncer({
      send: send ?? (async (body) => { sent.push(body); }),
      currentUserId: () => userId,
      now: () => clock,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 1_000_000;
    sent = [];
    userId = 'user-1';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces bursts per provider + club and sends the latest list', () => {
    const syncer = make();
    syncer.report(report({ bookings: [] }));
    syncer.report(report());
    syncer.report(report({ clubId: 'club-2' }));
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(BOOKING_MIRROR_DEBOUNCE_MS);
    expect(sent.map((b) => b.clubId).sort()).toEqual(['club-1', 'club-2']);
    expect(sent.find((b) => b.clubId === 'club-1')?.bookings).toHaveLength(1);
  });

  it('sends at most once per key per ~2 minutes', () => {
    const syncer = make();
    syncer.report(report());
    vi.advanceTimersByTime(BOOKING_MIRROR_DEBOUNCE_MS);
    clock += 60_000;
    syncer.report(report());
    vi.advanceTimersByTime(BOOKING_MIRROR_DEBOUNCE_MS);
    expect(sent).toHaveLength(1);
    clock += BOOKING_MIRROR_MIN_INTERVAL_MS;
    syncer.report(report({ provider: 'BOOKTIME' }));
    vi.advanceTimersByTime(BOOKING_MIRROR_DEBOUNCE_MS);
    expect(sent).toHaveLength(2);
  });

  it('keys by user: another account syncs right away; signed out sends nothing', () => {
    const syncer = make();
    syncer.report(report());
    vi.advanceTimersByTime(BOOKING_MIRROR_DEBOUNCE_MS);
    userId = 'user-2';
    syncer.report(report());
    vi.advanceTimersByTime(BOOKING_MIRROR_DEBOUNCE_MS);
    userId = null;
    syncer.report(report({ clubId: 'club-3' }));
    vi.advanceTimersByTime(BOOKING_MIRROR_DEBOUNCE_MS);
    expect(sent).toHaveLength(2);
  });

  it('a failed send is retried on the next load', async () => {
    let fail = true;
    const syncer = make(async (body) => {
      if (fail) throw new Error('offline');
      sent.push(body);
    });
    syncer.report(report());
    vi.advanceTimersByTime(BOOKING_MIRROR_DEBOUNCE_MS);
    await vi.runAllTimersAsync();
    fail = false;
    syncer.report(report());
    vi.advanceTimersByTime(BOOKING_MIRROR_DEBOUNCE_MS);
    expect(sent).toHaveLength(1);
  });
});
