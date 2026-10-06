import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ClubScheduleResponseV2, ScheduleSlotV2 } from '@shared/clubAdmin/contract';
import { CLUB_ADMIN_CAPABILITIES, CLUB_ADMIN_ROLE_CAPABILITIES } from '@shared/clubAdmin/contract';
import { clubWallTimeToUtc } from '@shared/clubAdmin/clubTime';
import {
  consoleDepth,
  hasAny,
  sectionFromPath,
  switchClubPath,
  visibleClubPages,
  visibleSections,
} from '@/clubAdmin/consoleNav';
import {
  clubAdminErrorMessageKey,
  holdOverlapDetails,
  isEndpointMissing,
  parseClubAdminError,
} from '@/api/clubAdminErrors';
import { buildCancelMessage, formatClubDateTimeFor } from './schedule/cancelMessage';
import { buildScheduleModel } from './schedule/scheduleModel';
import { deriveDashboard, unionLength } from './today/deriveDashboard';
import { attentionRows } from './today/attentionModel';
import { groupBookingsByDay } from './bookings/groupByDay';
import { isClubOpenAt } from './console/hours';

// ---------------------------------------------------------------------------
// Capability gating
// ---------------------------------------------------------------------------

describe('capability gating', () => {
  const staff = CLUB_ADMIN_ROLE_CAPABILITIES.STAFF;
  const admin = CLUB_ADMIN_CAPABILITIES;

  it('shows STAFF Today, Schedule and Bookings only', () => {
    expect(visibleSections(staff).map((s) => s.id)).toEqual(['today', 'schedule', 'bookings']);
    expect(visibleClubPages(staff)).toEqual([]);
  });

  it('shows ADMIN every section and every club screen that exists', () => {
    expect(visibleSections(admin).map((s) => s.id)).toEqual(['today', 'schedule', 'bookings', 'reports', 'club']);
    expect(visibleClubPages(admin).map((p) => p.id)).toEqual(['profile', 'hours', 'courts', 'pricing']);
  });

  it('opens the Club area for any one club capability', () => {
    expect(visibleSections(['schedule.view', 'courts.edit']).map((s) => s.id)).toContain('club');
    expect(visibleClubPages(['courts.edit']).map((p) => p.id)).toEqual(['courts']);
    expect(hasAny([], [])).toBe(true);
  });

  it('maps paths to sections, depth and the club switcher target', () => {
    expect(sectionFromPath('/my-clubs/k1')).toBe('today');
    expect(sectionFromPath('/my-clubs/k1/reservations')).toBe('bookings');
    expect(sectionFromPath('/my-clubs/k1/courts')).toBe('club');
    expect(sectionFromPath('/my-clubs/k1/club/hours')).toBe('club');
    expect(consoleDepth('/my-clubs/k1/schedule')).toBe(0);
    expect(consoleDepth('/my-clubs/k1/club/hours')).toBe(1);
    expect(switchClubPath('/my-clubs/k1/club/hours', 'k2')).toBe('/my-clubs/k2/club');
    expect(switchClubPath('/my-clubs/k1/schedule', 'k2')).toBe('/my-clubs/k2/schedule');
  });
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function axiosError(status: number | null, data?: unknown): AxiosError {
  const err = new AxiosError('x', status ? 'ERR_BAD_RESPONSE' : 'ERR_NETWORK');
  if (status) {
    err.response = { status, data, statusText: '', headers: {}, config: { headers: new AxiosHeaders() } };
  }
  return err;
}

describe('club admin errors', () => {
  it('treats a bare 404 as "endpoint not deployed" and a coded 404 as not found', () => {
    expect(isEndpointMissing(axiosError(404, { message: 'Route not found' }))).toBe(true);
    expect(isEndpointMissing(axiosError(404, { code: 'clubAdmin.notFound' }))).toBe(false);
  });

  it('maps codes and transport failures to i18n keys', () => {
    expect(clubAdminErrorMessageKey(axiosError(409, { code: 'clubAdmin.holdInPast' }))).toBe('errors.holdInPast');
    expect(clubAdminErrorMessageKey(axiosError(null))).toBe('errors.network');
    expect(clubAdminErrorMessageKey(axiosError(500, {}))).toBe('errors.generic');
    expect(parseClubAdminError(axiosError(403, { code: 'clubAdmin.capability' })).suffix).toBe('capability');
  });

  it('reads overlap details for the "create anyway" dialog', () => {
    const overlaps = [{ kind: 'game', courtId: 'c1', startTime: 'a', endTime: 'b', id: 'g' }];
    expect(holdOverlapDetails(axiosError(409, { code: 'clubAdmin.holdOverlap', details: { overlaps } }))?.overlaps).toEqual(overlaps);
    expect(holdOverlapDetails(axiosError(409, { code: 'clubAdmin.validation' }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cancel message
// ---------------------------------------------------------------------------

/** Minimal i18next-like `t` over the English templates. */
function fakeT(templates: Record<string, string>) {
  return (key: string, opts: Record<string, unknown> = {}) =>
    (templates[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k] ?? ''));
}

const EN = fakeT({
  'dm.courtCancelled': 'Hi {{hostName}}, your court at {{club}} on {{date}} {{time}} was cancelled by the club. Reason: {{reason}}.{{note}}',
  'dm.courtCleared': 'Hi {{hostName}}, your court reservation at {{club}} on {{date}} {{time}} was released by the club. Reason: {{reason}}.{{note}}',
  'dm.hostFallback': 'there',
});

describe('cancel message', () => {
  const startTime = '2026-10-06T18:30:00Z';

  it('uses the club wall clock, not the device zone', () => {
    expect(formatClubDateTimeFor(startTime, 'Europe/Belgrade', 'en').time).toBe('20:30');
    expect(formatClubDateTimeFor(startTime, 'Asia/Tokyo', 'en').time).toBe('03:30');
    expect(formatClubDateTimeFor(startTime, 'Asia/Tokyo', 'en').date).toMatch(/7/);
  });

  it('formats the date in the message language (Serbian Latin, Russian)', () => {
    expect(formatClubDateTimeFor(startTime, 'Europe/Belgrade', 'sr').date).toMatch(/okt/i);
    expect(formatClubDateTimeFor(startTime, 'Europe/Belgrade', 'ru').date).toMatch(/окт/i);
  });

  it('builds the cancel and release texts with reason and optional note', () => {
    const base = { hostFirstName: 'Ana', clubName: 'Padel Bg', startTime, timeZone: 'Europe/Belgrade', language: 'en', t: EN };
    const cancel = buildCancelMessage({ ...base, mode: 'cancel', reason: 'Maintenance', note: 'Sorry!' });
    expect(cancel).toContain('Hi Ana, your court at Padel Bg on');
    expect(cancel).toContain('20:30 was cancelled');
    expect(cancel.endsWith('Reason: Maintenance. Sorry!')).toBe(true);
    const clear = buildCancelMessage({ ...base, mode: 'clear', reason: ' ', hostFirstName: null });
    expect(clear.startsWith('Hi there, your court reservation')).toBe(true);
    expect(clear.endsWith('Reason: ….')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Today (legacy derivation + attention)
// ---------------------------------------------------------------------------

describe('today derivation', () => {
  const TZ = 'Europe/Belgrade';
  const date = '2026-10-06';
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return clubWallTimeToUtc(date, h * 60 + m, TZ).toISOString();
  };

  it('unions overlapping intervals and clips them to the window', () => {
    expect(unionLength([[0, 10], [5, 20], [30, 40]], 0, 35)).toBe(25);
    expect(unionLength([], 0, 10)).toBe(0);
  });

  it('computes occupancy over open court-minutes, games and players, and the attention list', () => {
    const game = (id: string, courtId: string | null, from: string, to: string, players: number): ScheduleSlotV2 => ({
      type: 'game',
      gameId: id,
      courtId,
      startTime: at(from),
      endTime: at(to),
      hasBookedCourt: true,
      status: 'ANNOUNCED',
      entityType: 'GAME',
      name: null,
      host: { id: 'u', firstName: 'A', lastName: null, avatar: null },
      participantCount: players,
    });
    const schedule: ClubScheduleResponseV2 = {
      slots: [game('g1', 'c1', '10:00', '12:00', 4), game('g2', 'c1', '11:00', '13:00', 2), game('g3', null, '15:00', '16:00', 3)],
      conflicts: [{ courtId: 'c1', startTime: at('11:00'), endTime: at('12:00'), kinds: ['game', 'game'] }],
      isLoadingExternalSlots: false,
      hours: { open: '08:00', close: '18:00', openAt: '', closeAt: '' },
      slotMinutes: 60,
      courts: [
        { id: 'c1', name: 'C1', isIndoor: false, sport: null, isActive: true, sortOrder: 0 },
        { id: 'c2', name: 'C2', isIndoor: false, sport: null, isActive: true, sortOrder: 1 },
      ],
    };
    const model = buildScheduleModel({ date, timeZone: TZ, response: schedule, legacy: null, unassignedLabel: '-' });
    const d = deriveDashboard({
      schedule,
      window: model.window,
      courts: model.courts,
      nowMs: Date.parse(at('11:30')),
      currency: 'EUR',
      setup: { hasCourts: true, hasHours: true, hasPrices: false, hasPhotos: true, hasContacts: true },
    });
    // c1 booked 10:00–13:00 = 180 of 2 × 600 open minutes.
    expect(d.kpis.bookedMinutes).toBe(180);
    expect(d.kpis.openMinutes).toBe(1200);
    expect(d.kpis.occupancyPct).toBe(15);
    expect(d.kpis.games).toBe(3);
    expect(d.kpis.players).toBe(9);
    expect(d.upNext.map((b) => b.id)).toEqual(['game:g1:c1', 'game:g2:c1', 'game:g3:']);
    expect(d.attention.map((a) => a.kind)).toEqual(['conflict', 'game_without_court', 'setup']);

    const rows = attentionRows(d.attention, 'k1', () => true);
    expect(rows.map((r) => r.to)).toEqual(['/my-clubs/k1/schedule?date=2026-10-06', '/my-clubs/k1/schedule?date=2026-10-06']);
    expect(attentionRows(d.attention, 'k1', () => false).every((r) => r.to === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bookings grouping + open-now
// ---------------------------------------------------------------------------

describe('club-local grouping', () => {
  it('groups by the club day, not the device day', () => {
    const mk = (id: string, start: string) =>
      ({ id, kind: 'external', provider: 'x', courtId: 'c', courtName: null, startTime: start, endTime: start, billing: null }) as const;
    const groups = groupBookingsByDay([mk('a', '2026-10-06T22:30:00Z'), mk('b', '2026-10-06T21:00:00Z')], 'Europe/Belgrade');
    expect(groups.map((g) => [g.date, g.items.map((i) => i.id)])).toEqual([
      ['2026-10-07', ['a']],
      ['2026-10-06', ['b']],
    ]);
  });

  it('judges "open now" on the club wall clock, overnight included', () => {
    const now = new Date('2026-10-06T23:30:00Z'); // 01:30 in Belgrade
    expect(isClubOpenAt('08:00', '02:00', 'Europe/Belgrade', now)).toBe(true);
    expect(isClubOpenAt('08:00', '23:00', 'Europe/Belgrade', now)).toBe(false);
    expect(isClubOpenAt(null, '23:00', 'Europe/Belgrade', now)).toBeNull();
  });
});
