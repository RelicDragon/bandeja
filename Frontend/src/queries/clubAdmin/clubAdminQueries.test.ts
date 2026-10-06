import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { ClubScheduleResponseV2, ScheduleHoldSlot } from '@shared/clubAdmin/contract';
import { bookingsFilterKey, clubAdminKeys } from './keys';
import { bookingChangeKeys, invalidateAfterBookingChange } from './invalidation';
import { findHold, insertSlot, patchHold, removeGame, removeHolds, restoreSchedule, snapshotSchedule, updateScheduleDays } from './scheduleCache';
import { holdDeletePredicate } from './holdPredicates';
import { SCHEDULE_POLL_MS, SCHEDULE_POLL_SYNCING_MS, schedulePollInterval } from './pollInterval';
import { matchesBookingFilters, reservationToBooking } from './legacyBookings';
import { legacyContextFromClub } from './legacyContext';
import type { ClubAdminLegacyClub } from '@/api/clubAdmin';

const hold = (id: string, start: string, extra: Partial<ScheduleHoldSlot> = {}): ScheduleHoldSlot => ({
  type: 'hold',
  holdId: id,
  courtId: 'c1',
  label: 'WALK_IN',
  note: null,
  startTime: start,
  endTime: new Date(Date.parse(start) + 3_600_000).toISOString(),
  ...extra,
});

const day = (slots: ClubScheduleResponseV2['slots']): ClubScheduleResponseV2 => ({ slots, conflicts: [], isLoadingExternalSlots: false });

describe('club admin query keys', () => {
  it('nests every per-club key under the club prefix', () => {
    const prefix = clubAdminKeys.club('k1');
    for (const key of [
      clubAdminKeys.context('k1'),
      clubAdminKeys.schedule('k1', '2026-10-06'),
      clubAdminKeys.dashboard('k1', '2026-10-06'),
      clubAdminKeys.bookings('k1', { scope: 'upcoming' }),
      clubAdminKeys.legacyClub('k1'),
    ]) {
      expect(key.slice(0, prefix.length)).toEqual([...prefix]);
    }
    expect(clubAdminKeys.schedule('k1', 'd').slice(0, 4)).toEqual([...clubAdminKeys.scheduleAll('k1')]);
  });

  it('gives the same bookings key to the same filters in any order and case', () => {
    expect(bookingsFilterKey({ scope: 'upcoming', kinds: ['hold', 'game'], q: ' Ana ' })).toBe(
      bookingsFilterKey({ scope: 'upcoming', kinds: ['game', 'hold'], q: 'ana' })
    );
    expect(bookingsFilterKey({ scope: 'past' })).not.toBe(bookingsFilterKey({ scope: 'upcoming' }));
  });
});

describe('invalidation after a booking change', () => {
  it('targets schedule, bookings, dashboard and the picker counts — not context', () => {
    const keys = bookingChangeKeys('k1').map((k) => JSON.stringify(k));
    expect(keys).toContain(JSON.stringify(clubAdminKeys.scheduleAll('k1')));
    expect(keys).toContain(JSON.stringify(clubAdminKeys.bookingsAll('k1')));
    expect(keys).toContain(JSON.stringify(clubAdminKeys.dashboardAll('k1')));
    expect(keys).toContain(JSON.stringify(clubAdminKeys.clubsAll));
    expect(keys).not.toContain(JSON.stringify(clubAdminKeys.context('k1')));
  });

  it('marks exactly those caches stale', async () => {
    const qc = new QueryClient();
    qc.setQueryData(clubAdminKeys.schedule('k1', '2026-10-06'), day([]));
    qc.setQueryData(clubAdminKeys.bookings('k1', { scope: 'upcoming' }), { pages: [], pageParams: [] });
    qc.setQueryData(clubAdminKeys.context('k1'), { ok: true });
    qc.setQueryData(clubAdminKeys.schedule('other', '2026-10-06'), day([]));
    await invalidateAfterBookingChange(qc, 'k1');
    const stale = (key: readonly unknown[]) => qc.getQueryState(key)?.isInvalidated;
    expect(stale(clubAdminKeys.schedule('k1', '2026-10-06'))).toBe(true);
    expect(stale(clubAdminKeys.bookings('k1', { scope: 'upcoming' }))).toBe(true);
    expect(stale(clubAdminKeys.context('k1'))).toBe(false);
    expect(stale(clubAdminKeys.schedule('other', '2026-10-06'))).toBe(false);
  });
});

describe('optimistic schedule edits', () => {
  it('inserts, patches and removes holds without touching other slots', () => {
    const d = day([hold('a', '2026-10-06T08:00:00.000Z')]);
    const withB = insertSlot(d, hold('b', '2026-10-06T10:00:00.000Z'));
    expect(withB.slots).toHaveLength(2);
    const moved = patchHold(withB, 'b', { courtId: 'c2' });
    expect(findHold(moved, 'b')?.courtId).toBe('c2');
    expect(findHold(moved, 'a')?.courtId).toBe('c1');
    expect(removeHolds(moved, (h) => h.holdId === 'a').slots).toHaveLength(1);
    expect(removeHolds(d, () => false)).toBe(d);
    expect(removeGame(d, 'nope')).toBe(d);
  });

  it('deletes one hold or this-and-following of a series', () => {
    const s = (id: string, start: string) => hold(id, start, { seriesId: 'S' });
    const one = holdDeletePredicate({ holdId: 'b', scope: 'one', seriesId: 'S', startTime: '2026-10-13T08:00:00.000Z' });
    const following = holdDeletePredicate({ holdId: 'b', scope: 'following', seriesId: 'S', startTime: '2026-10-13T08:00:00.000Z' });
    const a = s('a', '2026-10-06T08:00:00.000Z');
    const b = s('b', '2026-10-13T08:00:00.000Z');
    const c = s('c', '2026-10-20T08:00:00.000Z');
    expect([one(a), one(b), one(c)]).toEqual([false, true, false]);
    expect([following(a), following(b), following(c)]).toEqual([false, true, true]);
  });

  it('snapshots every cached day and restores it after a failure', async () => {
    const qc = new QueryClient();
    const key = clubAdminKeys.schedule('k1', '2026-10-06');
    const original = day([hold('a', '2026-10-06T08:00:00.000Z')]);
    qc.setQueryData(key, original);
    const snap = await snapshotSchedule(qc, 'k1');
    updateScheduleDays(qc, 'k1', (d) => removeHolds(d, () => true));
    expect(qc.getQueryData<ClubScheduleResponseV2>(key)?.slots).toHaveLength(0);
    restoreSchedule(qc, snap);
    expect(qc.getQueryData(key)).toEqual(original);
  });
});

describe('schedule polling', () => {
  it('polls every 15 s, faster while the provider syncs, never while paused', () => {
    expect(schedulePollInterval(day([]), false)).toBe(SCHEDULE_POLL_MS);
    expect(SCHEDULE_POLL_MS).toBe(15_000);
    expect(schedulePollInterval({ ...day([]), isLoadingExternalSlots: true }, false)).toBe(SCHEDULE_POLL_SYNCING_MS);
    expect(schedulePollInterval(day([]), true)).toBe(false);
  });
});

describe('legacy fallbacks', () => {
  it('derives a full-admin context in the club zone from the legacy club row', () => {
    const club = {
      id: 'k1',
      name: 'Club',
      address: '',
      cityId: 'x',
      city: { id: 'x', name: 'Tokyo', timezone: 'Asia/Tokyo' },
      openingTime: '08:00',
      closingTime: '01:00',
      courts: [{ id: 'c1', name: 'C1', clubId: 'k1', isIndoor: true, pricePerHour: 2000 }],
    } as unknown as ClubAdminLegacyClub;
    // 2026-10-06 20:00 UTC is already the 7th in Tokyo.
    const ctx = legacyContextFromClub(club, new Date('2026-10-06T20:00:00Z'));
    expect(ctx.apiVersion).toBe('legacy');
    expect(ctx.today).toBe('2026-10-07');
    expect(ctx.role).toBe('ADMIN');
    expect(ctx.capabilities).toContain('reports.view');
    expect(ctx.setup).toMatchObject({ hasCourts: true, hasHours: true, hasPrices: true, hasPhotos: false, hasContacts: false });
    expect(ctx.legacy?.courts[0]).toMatchObject({ id: 'c1', isIndoor: true, isActive: true });
  });

  it('maps legacy reservations and filters them client-side', () => {
    const b = reservationToBooking({
      kind: 'hold',
      id: 'x',
      holdId: 'h1',
      courtId: 'c1',
      courtName: 'Court 1',
      startTime: '2026-10-06T08:00:00Z',
      endTime: '2026-10-06T09:00:00Z',
      label: 'PHONE',
      note: 'Marko',
    });
    expect(b).toMatchObject({ id: 'hold:h1', kind: 'hold', holdId: 'h1' });
    expect(matchesBookingFilters(b, { scope: 'upcoming', kinds: ['hold'], q: 'mark' })).toBe(true);
    expect(matchesBookingFilters(b, { scope: 'upcoming', kinds: ['game'] })).toBe(false);
    expect(matchesBookingFilters(b, { scope: 'upcoming', courtId: 'c2' })).toBe(false);
    expect(matchesBookingFilters(b, { scope: 'upcoming', payment: 'NONE' })).toBe(true);
  });
});
