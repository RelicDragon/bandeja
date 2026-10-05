import { describe, expect, it } from 'vitest';
import type { Club } from '@/types';
import type { ClubBookingProvider } from '@/integrations/booking/ClubBookingProvider';
import type { BookStep, ReassignCourtStep } from '@shared/gameBooking/planReschedule';
import type { ReservationChange } from '@/api/courtSlots';
import {
  buildSaveBody,
  createReservationChangeBody,
  createReservationExecutors,
  gameCourtIdFromSlotKey,
  journalFromServerRun,
  toServerFinishState,
  toServerStepStatus,
  type ReservationExecutorDeps,
} from './reservationExecutors';
import { createRunJournal } from './reservationRunner';
import { clubFollowUpsFromPayload, clubFollowUpsFromRun, mergeClubFollowUps } from './clubFollowUps';
import { toOccupancyBlocks } from './occupancyBlocks';
import { at } from './courtReservationsFixtures';

const club = {
  id: 'club1',
  name: 'X-Padel',
  courts: [
    { id: 'c1', name: 'Court 1', clubId: 'club1', isIndoor: true, externalCourtId: 'bt-1' },
    { id: 'c2', name: 'Court 2', clubId: 'club1', isIndoor: true },
  ],
} as unknown as Club;

const step = (extra: Partial<BookStep> = {}): BookStep => ({
  kind: 'book',
  idempotencyKey: 'book:1',
  slotKey: 'gc:gc1',
  courtId: 'c1',
  provider: 'BOOKTIME',
  start: at('19:00'),
  end: at('20:00'),
  purpose: 'move',
  extraMinutes: 0,
  requiresVerifyBeforeRetry: true,
  ...extra,
});

function fakeDeps(provider: Partial<ClubBookingProvider>) {
  const calls: unknown[] = [];
  const deps: ReservationExecutorDeps = {
    createProvider: async (_club, minutes) => {
      calls.push(['provider', minutes]);
      return provider as ClubBookingProvider;
    },
    weltnerBook: async () => {
      throw new Error('unused');
    },
    weltnerBookings: async () => [],
    saveAtomic: async (id, body) => calls.push(['atomic', id, body]),
    saveSeparately: async (id, body) => {
      calls.push(['separate', id, body]);
    },
    loadGameWindow: async () => ({ startTime: at('19:00'), endTime: at('20:00') }),
    saveGameTime: async (id, w) => calls.push(['time', id, w]),
  };
  return { deps, calls };
}

const env = {
  gameId: 'g1',
  club,
  timeZone: 'Europe/Belgrade',
  slots: {
    gameCourts: [{ gameCourtId: 'gc1', courtId: 'c1', order: 1, reservation: 'NONE' as const }],
    reportedAnyCourtCount: 0,
  },
};

describe('createReservationExecutors', () => {
  it('books with the club wall clock and normalizes a naive local answer to UTC', async () => {
    const seen: unknown[] = [];
    const { deps } = fakeDeps({
      bookSlot: async (params) => {
        seen.push(params);
        return { externalBookingId: 'bt-77', bookingStart: '2026-10-08T19:00:00', bookingEnd: '2026-10-08T20:00:00' };
      },
    });
    const ex = createReservationExecutors(env, deps);
    const result = await ex.book(step());
    expect(seen[0]).toMatchObject({ courtId: 'c1', externalCourtId: 'bt-1', dateKey: '2026-10-08', startTime: '19:00', durationMinutes: 60 });
    expect(result).toEqual({ externalBookingId: 'bt-77', bookingStart: at('19:00'), bookingEnd: at('20:00') });
  });

  it('refuses a court with no provider mapping', async () => {
    const { deps } = fakeDeps({});
    await expect(createReservationExecutors(env, deps).book(step({ courtId: 'c2' }))).rejects.toThrow('no_external_court');
  });

  it('finds the in-flight booking among upcoming ones by exact time, skipping known ids', async () => {
    const { deps } = fakeDeps({
      listUpcoming: async () => [
        { externalBookingId: 'known', bookingStart: at('19:00'), bookingEnd: at('20:00') },
        { externalBookingId: 'other-time', bookingStart: at('18:00'), bookingEnd: at('19:00') },
        { externalBookingId: 'landed', bookingStart: '2026-10-08T19:00:00', bookingEnd: '2026-10-08T20:00:00' },
      ],
    });
    const found = await createReservationExecutors(env, deps).findExistingBooking!(step(), ['known']);
    expect(found?.externalBookingId).toBe('landed');
  });

  it('never calls the API to cancel a provider that cancels through the club', async () => {
    const { deps } = fakeDeps({ cancelBooking: async () => undefined });
    await expect(createReservationExecutors(env, deps).cancelBooking('WELTNER', 'w-1')).rejects.toThrow('cancel_via_club');
  });

  it('saves atomically with a server run, call by call without one; confirms a landed save', async () => {
    const { deps, calls } = fakeDeps({});
    const ex = createReservationExecutors(env, deps);
    const save = { kind: 'save_game' as const, idempotencyKey: 's', start: at('19:00'), end: at('20:00') };
    await ex.saveGame(save, { runId: 'run-1', linksToAdd: [], reassignments: [], linksToRemove: [] });
    await ex.saveGame(save, { runId: null, linksToAdd: [], reassignments: [], linksToRemove: [] });
    expect(calls.map((c) => (c as unknown[])[0])).toEqual(['atomic', 'separate']);
    expect(await ex.isGameSaved!(save)).toBe(true);
  });
});

describe('buildSaveBody', () => {
  it('maps links to link-booking bodies with the slot id, reassignments to a full slot list', () => {
    const reassign: ReassignCourtStep = {
      kind: 'reassign_court',
      idempotencyKey: 'r',
      slotKey: 'gc:gc1',
      gameCourtId: 'gc1',
      fromCourtId: 'c1',
      toCourtId: 'c5',
    };
    const body = buildSaveBody(
      { start: at('19:00'), end: at('20:30') },
      {
        runId: 'run-1',
        linksToAdd: [
          {
            slotKey: 'gc:gc1',
            courtId: 'c5',
            booking: { externalBookingId: 'bt-1', bookingStart: at('19:00'), bookingEnd: at('21:00'), provider: 'BOOKTIME', courtId: 'c5' },
          },
          {
            slotKey: 'any:0',
            courtId: 'c2',
            booking: { externalBookingId: 'bt-2', bookingStart: at('19:00'), bookingEnd: at('21:00'), provider: 'BOOKTIME', courtId: 'c2' },
          },
        ],
        reassignments: [reassign],
        linksToRemove: ['bt-old'],
      },
      env.slots,
    );
    expect(body).toEqual({
      startTime: at('19:00'),
      endTime: at('20:30'),
      slotUpdates: { slots: [{ courtId: 'c5', reservation: 'NONE' }], reportedAnyCourtCount: 0 },
      linksToAdd: [
        {
          externalBookingId: 'bt-1',
          snapshot: { externalBookingId: 'bt-1', courtId: 'c5', bookingStart: at('19:00'), bookingEnd: at('21:00') },
          gameCourtId: 'gc1',
        },
        {
          externalBookingId: 'bt-2',
          snapshot: { externalBookingId: 'bt-2', courtId: 'c2', bookingStart: at('19:00'), bookingEnd: at('21:00') },
        },
      ],
      linksToRemove: ['bt-old'],
    });
    expect(gameCourtIdFromSlotKey('gc:legacy:c1')).toBeNull();
  });
});

describe('server journal mapping', () => {
  it('maps statuses and finish states; paused never finishes', () => {
    expect(toServerStepStatus('follow_up')).toBe('NEEDS_CLUB');
    expect(toServerStepStatus('rolled_back')).toBe('SKIPPED');
    expect(toServerFinishState('done')).toBe('COMPLETED');
    expect(toServerFinishState('rolled_back')).toBe('ROLLED_BACK');
    expect(toServerFinishState('paused')).toBeNull();
  });

  it('builds the create body from the journal windows and full steps', () => {
    const save = { kind: 'save_game' as const, idempotencyKey: 's', start: at('19:00'), end: at('20:30') };
    const journal = createRunJournal('g1', [step(), save], { fromWindow: { start: at('18:00'), end: at('19:30') } });
    expect(createReservationChangeBody(journal)).toEqual({
      plan: { steps: [step(), save] },
      fromStart: at('18:00'),
      fromEnd: at('19:30'),
      toStart: at('19:00'),
      toEnd: at('20:30'),
    });
  });

  it('rebuilds another device\'s running change from plan.steps + server statuses', () => {
    const save = { kind: 'save_game' as const, idempotencyKey: 's', start: at('19:00'), end: at('20:30') };
    const change: ReservationChange = {
      id: 'run-9',
      gameId: 'g1',
      createdById: 'u1',
      state: 'RUNNING',
      plan: { steps: [{ ...step() }, { ...save }] },
      fromStart: at('18:00'),
      fromEnd: at('19:30'),
      toStart: at('19:00'),
      toEnd: at('20:30'),
      createdAt: at('10:00'),
      updatedAt: at('10:01'),
      steps: [
        {
          id: 'x',
          idempotencyKey: 'book:1',
          kind: 'book',
          status: 'DONE',
          result: { externalBookingId: 'bt-5', bookingStart: at('19:00'), bookingEnd: at('20:00'), provider: 'BOOKTIME', courtId: 'c1' },
        },
        { id: 'y', idempotencyKey: 's', kind: 'save_game', status: 'PENDING' },
      ],
    };
    const journal = journalFromServerRun('g1', change)!;
    expect(journal.phase).toBe('running');
    expect(journal.serverRunId).toBe('run-9');
    expect(journal.steps.map((s) => s.status)).toEqual(['done', 'pending']);
    expect(journal.steps[0].booking?.externalBookingId).toBe('bt-5');
    expect(journalFromServerRun('g1', { ...change, state: 'COMPLETED' })).toBeNull();
    expect(journalFromServerRun('g1', { ...change, plan: null })).toBeNull();
  });
});

describe('club follow-ups', () => {
  it('maps server NEEDS_CLUB steps and de-duplicates them against the local run', () => {
    const server = clubFollowUpsFromPayload([
      {
        changeId: 'run-1',
        changeState: 'COMPLETED',
        idempotencyKey: 'cancel:bt-old',
        kind: 'manual_cancel',
        step: { externalBookingId: 'bt-old', provider: 'WELTNER' },
      },
    ]);
    expect(server[0]).toMatchObject({ reason: 'cancel_old', externalBookingId: 'bt-old', changeId: 'run-1', idempotencyKey: 'cancel:bt-old' });
    const journal = createRunJournal('g1', []);
    journal.phase = 'done';
    journal.followUps = [
      { key: 'cancel:bt-old', reason: 'manual_cancel', provider: 'WELTNER', courtId: null, externalBookingId: 'bt-old' },
      { key: 'ask', reason: 'manual_club', provider: null, courtId: 'c3', start: at('19:00'), end: at('20:30') },
    ];
    const local = clubFollowUpsFromRun(journal, { 'bt-old': { start: at('18:00'), end: at('19:30') } });
    expect(local[0]).toMatchObject({ start: at('18:00') });
    expect(mergeClubFollowUps(server, local).map((f) => f.reason)).toEqual(['cancel_old', 'ask_club']);
  });
});

describe('toOccupancyBlocks', () => {
  it('drops the game itself and classifies the rest', () => {
    const blocks = toOccupancyBlocks(
      [
        { courtId: 'c1', startTime: at('18:00'), endTime: at('19:30'), gameId: 'g1', reservation: 'reserved' },
        { courtId: 'c1', startTime: at('19:30'), endTime: at('21:00'), slotKind: 'external', clubBooked: true },
        { courtId: 'c2', startTime: at('19:00'), endTime: at('20:00'), slotKind: 'hold' },
        { courtId: 'c3', startTime: at('19:00'), endTime: at('20:00'), slotKind: 'game', gameId: 'g2', reservation: 'reserved' },
        { courtId: 'c4', startTime: at('19:00'), endTime: at('20:00'), slotKind: 'game', gameId: 'g3', reservation: 'planned' },
        { courtId: null, startTime: at('19:00'), endTime: at('20:00') },
      ],
      'g1',
    );
    expect(blocks.map((b) => `${b.courtId}:${b.kind}`)).toEqual([
      'c1:club',
      'c2:hold',
      'c3:app_game_reserved',
      'c4:app_game_planned',
    ]);
  });
});
