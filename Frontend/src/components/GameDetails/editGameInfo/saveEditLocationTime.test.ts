import { describe, expect, it } from 'vitest';
import type { Game } from '@/types';
import { buildEditLocationTimeRequests, currentCourtSlotCount } from './saveEditLocationTime';

const start = '2026-10-10T18:00:00.000Z';
const end = '2026-10-10T19:30:00.000Z';

function gameCourt(courtId: string, order: number, reservation: 'NONE' | 'REPORTED' = 'NONE') {
  return { id: `gc-${courtId}`, gameId: 'g1', courtId, order, reservation, court: { id: courtId } } as NonNullable<Game['gameCourts']>[number];
}

function game(patch: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    clubId: 'club',
    courtId: 'c1',
    startTime: start,
    endTime: end,
    timeIsSet: true,
    maxParticipants: 8,
    playersPerMatch: 4,
    reportedAnyCourtCount: 0,
    gameCourts: [gameCourt('c1', 1, 'REPORTED'), gameCourt('c2', 2)],
    participants: [],
    ...patch,
  } as Game;
}

describe('buildEditLocationTimeRequests', () => {
  it('sends nothing when nothing changed', () => {
    expect(
      buildEditLocationTimeRequests({ game: game(), clubId: 'club', courtIds: ['c1', 'c2'], slotModel: true, courtSlotCount: 2, time: { startTime: start, endTime: end } }),
    ).toEqual({ claimBody: null, gamePatch: null, slotsBody: null });
  });

  it('keeps reported courts, adds new ones as planned and sets an explicit count', () => {
    const g = game();
    expect(currentCourtSlotCount(g)).toBe(2);
    const requests = buildEditLocationTimeRequests({ game: g, clubId: 'club', courtIds: ['c1', 'c3'], slotModel: true, courtSlotCount: 3, time: null });
    expect(requests.gamePatch).toBeNull();
    expect(requests.slotsBody).toEqual({
      slots: [
        { courtId: 'c1', reservation: 'REPORTED' },
        { courtId: 'c3', reservation: 'NONE' },
      ],
      reportedAnyCourtCount: 0,
      courtSlotCount: 3,
    });
  });

  it('moves the time with the explicit policy body and resets slots on a club change', () => {
    const requests = buildEditLocationTimeRequests({
      game: game({ reportedAnyCourtCount: 1 }),
      clubId: 'club2',
      courtIds: ['x1'],
      slotModel: true,
      courtSlotCount: null,
      time: { startTime: '2026-10-10T19:00:00.000Z', endTime: '2026-10-10T20:30:00.000Z' },
    });
    expect(requests.gamePatch).toEqual({
      clubId: 'club2',
      courtId: 'x1',
      startTime: '2026-10-10T19:00:00.000Z',
      endTime: '2026-10-10T20:30:00.000Z',
      timeIsSet: true,
    });
    expect(requests.slotsBody).toEqual({ slots: [{ courtId: 'x1', reservation: 'NONE' }], reportedAnyCourtCount: 0 });
  });

  it('clamps reported any-court slots to the remaining count', () => {
    const requests = buildEditLocationTimeRequests({
      game: game({ reportedAnyCourtCount: 2, gameCourts: [gameCourt('c1', 1)], courtSlotCount: 3 }),
      clubId: 'club',
      courtIds: ['c1', 'c2'],
      slotModel: true,
      courtSlotCount: 3,
      time: null,
    });
    expect(requests.slotsBody?.reportedAnyCourtCount).toBe(1);
    expect(requests.slotsBody).not.toHaveProperty('courtSlotCount');
  });

  it('uses the plain court id for single-court entities (BAR)', () => {
    const requests = buildEditLocationTimeRequests({
      game: game({ entityType: 'BAR', gameCourts: [], courtId: 'h1' }),
      clubId: 'club',
      courtIds: ['h2'],
      slotModel: false,
      courtSlotCount: null,
      time: null,
    });
    expect(requests).toEqual({ claimBody: null, gamePatch: { courtId: 'h2' }, slotsBody: null });
  });

  describe('"It\'s my booking" claims', () => {
    const moved = { startTime: '2026-10-10T20:00:00.000Z', endTime: '2026-10-10T21:00:00.000Z' };

    it('marks a kept court reserved before the time moves, with nothing else to send', () => {
      const requests = buildEditLocationTimeRequests({
        game: game({ gameCourts: [gameCourt('c1', 1)], courtSlotCount: 1 }),
        clubId: 'club',
        courtIds: ['c1'],
        slotModel: true,
        courtSlotCount: 1,
        time: moved,
        reportedCourtIds: new Set(['c1']),
      });
      expect(requests.claimBody).toEqual({ slots: [{ courtId: 'c1', reservation: 'REPORTED' }], reportedAnyCourtCount: 0 });
      expect(requests.gamePatch).toEqual({ ...moved, timeIsSet: true });
      expect(requests.slotsBody).toBeNull();
    });

    it('claims kept courts first and sends added courts with their own claim afterwards', () => {
      const requests = buildEditLocationTimeRequests({
        game: game(),
        clubId: 'club',
        courtIds: ['c1', 'c2', 'c3'],
        slotModel: true,
        courtSlotCount: 3,
        time: moved,
        reportedCourtIds: new Set(['c1', 'c2', 'c3']),
      });
      expect(requests.claimBody?.slots).toEqual([
        { courtId: 'c1', reservation: 'REPORTED' },
        { courtId: 'c2', reservation: 'REPORTED' },
      ]);
      expect(requests.slotsBody?.slots).toEqual([
        { courtId: 'c1', reservation: 'REPORTED' },
        { courtId: 'c2', reservation: 'REPORTED' },
        { courtId: 'c3', reservation: 'REPORTED' },
      ]);
    });

    it('claims a court at a new club in the slots request (no claim step)', () => {
      const requests = buildEditLocationTimeRequests({
        game: game(),
        clubId: 'club2',
        courtIds: ['x1'],
        slotModel: true,
        courtSlotCount: null,
        time: moved,
        reportedCourtIds: new Set(['x1']),
      });
      expect(requests.claimBody).toBeNull();
      expect(requests.slotsBody?.slots).toEqual([{ courtId: 'x1', reservation: 'REPORTED' }]);
    });

    it('sends nothing extra when the claimed courts are already reserved', () => {
      const requests = buildEditLocationTimeRequests({
        game: game(),
        clubId: 'club',
        courtIds: ['c1', 'c2'],
        slotModel: true,
        courtSlotCount: 2,
        time: { startTime: start, endTime: end },
        reportedCourtIds: new Set(['c1']),
      });
      expect(requests).toEqual({ claimBody: null, gamePatch: null, slotsBody: null });
    });
  });
});
