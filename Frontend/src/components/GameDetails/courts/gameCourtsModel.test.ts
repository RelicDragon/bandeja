import { describe, expect, it } from 'vitest';
import type { Club, Court, Game } from '@/types';
import type { CourtSlotView } from '@shared/gameBooking/courtReservations';
import {
  buildSharedWith,
  courtClashDetails,
  describeCourtClash,
  freeCourtsForWindow,
  gapExtraLines,
  gapFillEntries,
  gapFillUnavailableMessage,
  planSlotReservations,
  rescheduleNeeded,
  resolveGameClub,
  timeChangeNoticeCount,
} from './gameCourtsModel';

const court = (id: string): Court => ({ id, name: `Court ${id}`, clubId: 'club', isIndoor: false, externalCourtId: `ext-${id}` });
const club: Club = { id: 'club', name: 'X-Padel', address: '', cityId: 'city', integrationType: 'BOOKTIME', courts: [court('c1')] };

function game(patch: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    clubId: 'club',
    club,
    startTime: '2026-10-10T18:00:00.000Z',
    endTime: '2026-10-10T19:30:00.000Z',
    timeIsSet: true,
    maxParticipants: 4,
    playersPerMatch: 4,
    participants: [],
    status: 'ANNOUNCED',
    resultsStatus: 'NONE',
    ...patch,
  } as Game;
}

function slot(patch: Partial<CourtSlotView>): CourtSlotView {
  return {
    key: 'any:0',
    order: 0,
    courtId: null,
    gameCourtId: null,
    effectiveCourtId: null,
    state: 'planned',
    links: [],
    provider: null,
    gaps: [],
    unknownTime: false,
    reportedById: null,
    reportedAt: null,
    coverage: { coveredMinutes: 0, totalMinutes: 90 },
    ...patch,
  };
}

const window = { start: '2026-10-10T18:00:00.000Z', end: '2026-10-10T19:30:00.000Z' };

describe('rescheduleNeeded', () => {
  it('is false for a single planned court and true with a linked reservation', () => {
    expect(rescheduleNeeded(game({ courtId: 'c1' }))).toBe(false);
    expect(
      rescheduleNeeded(
        game({
          courtId: 'c1',
          linkedBookings: [
            { id: 'l1', externalBookingId: 'b1', externalBookingProvider: 'BOOKTIME', courtId: 'c1', bookingStart: window.start, bookingEnd: window.end },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('is true with more than one court slot, and never for games without a time or club', () => {
    expect(rescheduleNeeded(game({ maxParticipants: 8 }))).toBe(true);
    expect(rescheduleNeeded(game({ maxParticipants: 8, timeIsSet: false }))).toBe(false);
    expect(rescheduleNeeded(game({ maxParticipants: 8, clubId: undefined, club: undefined }))).toBe(false);
    expect(rescheduleNeeded(game({ maxParticipants: 8, entityType: 'BAR' }))).toBe(false);
  });
});

describe('resolveGameClub', () => {
  it('merges the shell courts into the club and keeps the city for the timezone', () => {
    const resolved = resolveGameClub(game({ city: { id: 'city', timezone: 'Europe/Belgrade' } as Game['city'] }), [], [court('c2')]);
    expect(resolved?.courts?.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(resolved?.city?.timezone).toBe('Europe/Belgrade');
  });
});

describe('courtClashDetails', () => {
  it('reads the 409 body and ignores other errors', () => {
    const err = {
      response: { status: 409, data: { message: 'court.clash', code: 'court.clash', details: [{ courtId: 'c1', start: window.start, end: window.end, kind: 'club' }] } },
    };
    expect(courtClashDetails(err)).toEqual([{ courtId: 'c1', start: window.start, end: window.end, kind: 'club' }]);
    expect(courtClashDetails({ response: { status: 400, data: { message: 'nope' } } })).toBeNull();
    expect(courtClashDetails(new Error('x'))).toBeNull();
  });

  it('names the first clash when its court is known', () => {
    const details = [{ courtId: 'c1', start: window.start, end: window.end }];
    expect(describeCourtClash(details, () => 'Court 1', (iso) => iso.slice(11, 16))).toEqual({
      key: 'gameDetails.courts.clash',
      params: { court: 'Court 1', from: '18:00', to: '19:30' },
    });
    expect(describeCourtClash(details, () => undefined, (iso) => iso).key).toBe('gameDetails.courts.clashGeneric');
  });
});

describe('planSlotReservations', () => {
  const clubCourts = [{ id: 'c1', name: 'Court 1' }, { id: 'c2', name: 'Court 2' }, { id: 'c3', name: 'Court 3' }];

  it('books assigned courts on their slot and rounds up to a bookable length', () => {
    const plan = planSlotReservations({
      slots: [slot({ key: 'gc:gc1', courtId: 'c1', gameCourtId: 'gc1', effectiveCourtId: 'c1' })],
      allSlots: [],
      window,
      provider: 'BOOKTIME',
      clubCourts,
      occupancy: [],
    });
    // Booktime books 60 or 120 minutes: a 90-minute game takes 120.
    expect(plan).toEqual({ ok: true, entries: [{ courtId: 'c1', gameCourtId: 'gc1', start: window.start, durationMinutes: 120 }] });
  });

  it('gives any-court slots the picked court, else the next free court (busy and used courts skipped)', () => {
    const assigned = slot({ key: 'gc:gc1', courtId: 'c1', gameCourtId: 'gc1', effectiveCourtId: 'c1' });
    const anyA = slot({ key: 'any:0' });
    const anyB = slot({ key: 'any:1' });
    const plan = planSlotReservations({
      slots: [anyA, anyB],
      allSlots: [assigned, anyA, anyB],
      window,
      provider: 'PADELOO',
      clubCourts: [...clubCourts, { id: 'c4', name: 'Court 4' }],
      occupancy: [{ courtId: 'c2', start: window.start, end: window.end, kind: 'club' }],
      pickedCourtId: 'c4',
    });
    expect(plan.ok && plan.entries.map((e) => [e.courtId, e.gameCourtId, e.durationMinutes])).toEqual([
      ['c4', null, 90],
      ['c3', null, 90],
    ]);
  });

  it('refuses without a time or a free court', () => {
    const linked = slot({ key: 'gc:gc1', courtId: 'c1', gameCourtId: 'legacy:c1', effectiveCourtId: 'c1', state: 'linked' });
    expect(planSlotReservations({ slots: [linked], allSlots: [], window: null, provider: null, clubCourts, occupancy: [] })).toEqual({
      ok: false,
      reason: 'no_time',
    });
    expect(
      planSlotReservations({ slots: [slot({})], allSlots: [], window, provider: null, clubCourts: [], occupancy: [] }),
    ).toEqual({ ok: false, reason: 'no_court' });
  });
});

describe('gap fill glue', () => {
  const gap = { start: '2026-10-10T19:00:00.000Z', end: '2026-10-10T19:30:00.000Z' };
  const range = (a: string, b: string) => `${a.slice(11, 16)}-${b.slice(11, 16)}`;
  const t = (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`;

  it('turns bookable plans into entries on the real slot', () => {
    const result = { bookings: [{ courtId: 'c1', start: gap.start, end: '2026-10-10T20:00:00.000Z', extraMinutes: 30 }], extraMinutes: 30, gaps: [gap] };
    expect(gapFillEntries(result, { gameCourtId: 'gc1' })).toEqual([{ courtId: 'c1', gameCourtId: 'gc1', start: gap.start, durationMinutes: 60 }]);
    expect(gapFillEntries({ ...result, unavailableReason: 'clash' }, { gameCourtId: 'gc1' })).toEqual([]);
    expect(gapFillUnavailableMessage(result, () => 'Court 1', range)).toBeNull();
    expect(gapExtraLines(result, range, t)).toBe('gameDetails.courts.gapAdds{"range":"19:00-20:00"} gameDetails.courts.gapExtra{"minutes":30}');
  });

  it('explains why a gap cannot be filled', () => {
    const base = { bookings: [], extraMinutes: 0, gaps: [gap] };
    const clash = {
      ...base,
      unavailableReason: 'clash' as const,
      clash: { courtId: 'c1', cause: 'rounding' as const, blocks: [{ courtId: 'c1', start: gap.end, end: '2026-10-10T21:00:00.000Z', kind: 'club' as const }] },
    };
    expect(gapFillUnavailableMessage(clash, () => 'Court 1', range)).toEqual({
      key: 'gameDetails.courts.gapClash',
      params: { court: 'Court 1', time: '19:30-21:00' },
    });
    expect(gapFillUnavailableMessage({ ...base, unavailableReason: 'duration_unavailable' }, () => 'x', range)?.key).toBe('gameDetails.courts.gapAskClub');
    expect(gapFillUnavailableMessage({ ...base, unavailableReason: 'cannot_book' }, () => 'x', range)?.key).toBe('gameDetails.courts.gapAskClub');
    expect(gapFillUnavailableMessage({ ...base, unavailableReason: 'unknown_time' }, () => 'x', range)?.key).toBe('gameDetails.courts.gapUnavailable');
  });
});

describe('freeCourtsForWindow', () => {
  it('drops courts used by another slot or hard-blocked; planned games do not block', () => {
    const free = freeCourtsForWindow(
      [slot({ effectiveCourtId: 'c1', courtId: 'c1' })],
      [{ id: 'c1', name: '1' }, { id: 'c2', name: '2' }, { id: 'c3', name: '3' }, { id: 'c4', name: '4' }],
      [
        { courtId: 'c2', start: window.start, end: window.end, kind: 'app_game_reserved', gameId: 'other' },
        { courtId: 'c3', start: window.start, end: window.end, kind: 'app_game_planned', gameId: 'other' },
        { courtId: 'c4', start: '2026-10-10T20:00:00.000Z', end: '2026-10-10T21:00:00.000Z', kind: 'club' },
      ],
      window,
    );
    expect(free.map((c) => c.id)).toEqual(['c3', 'c4']);
  });
});

describe('buildSharedWith', () => {
  it('keys other games by link id and booking id, never listing this game', () => {
    const map = new Map([
      ['b1', [{ id: 'g1', name: 'me', startTime: window.start, endTime: window.end }, { id: 'g2', name: ' ', startTime: window.start, endTime: window.end }]],
      ['b2', [{ id: 'g1', name: 'me', startTime: window.start, endTime: window.end }]],
    ]);
    const shared = buildSharedWith([{ id: 'l1', externalBookingId: 'b1' }, { id: 'l2', externalBookingId: 'b2' }], map, 'g1', 'Another game');
    expect(Object.keys(shared).sort()).toEqual(['b1', 'l1']);
    expect(shared.l1).toEqual([{ gameId: 'g2', name: 'Another game', start: window.start, end: window.end, canEdit: false }]);
  });
});

describe('timeChangeNoticeCount', () => {
  const participants = (rows: Array<[string, string]>) =>
    rows.map(([userId, status]) => ({ userId, status })) as unknown as Game['participants'];

  it('never counts the editor: an organizer-only game notifies nobody', () => {
    expect(timeChangeNoticeCount({ participants: participants([['me', 'PLAYING']]) }, 'me')).toBe(0);
  });

  it('counts the other PLAYING participants only', () => {
    const p = participants([
      ['me', 'PLAYING'],
      ['a', 'PLAYING'],
      ['b', 'PLAYING'],
      ['q', 'IN_QUEUE'],
      ['i', 'INVITED'],
      ['t', 'NON_PLAYING'],
    ]);
    expect(timeChangeNoticeCount({ participants: p }, 'me')).toBe(2);
    expect(timeChangeNoticeCount({ participants: p }, null)).toBe(3);
  });
});
