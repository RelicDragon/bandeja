import { describe, expect, it } from 'vitest';
import type {
  BookStep,
  CancelStep,
  ManualClubStep,
  MoveSharedGameStep,
  PlanStep,
  ReassignCourtStep,
  SaveGameStep,
  UnlinkStep,
} from '@shared/gameBooking/planReschedule';
import {
  activeRunOf,
  clashDetailsOf,
  isBlockedByOtherRun,
  createRunJournal,
  flushRunMirror,
  isUnfinished,
  rollbackReservationChanges,
  runReservationChanges,
  RUN_ERROR,
  type BookResult,
  type MirrorOp,
  type ReservationExecutors,
  type RunJournal,
  type RunnerDeps,
  type SaveGameContext,
  type ServerRunJournal,
} from './reservationRunner';
import { createMemoryRunJournalStore } from './runJournalStorage';

const T = (hhmm: string) => `2026-06-12T${hhmm}:00.000Z`;

const book = (id: string, extra: Partial<BookStep> = {}): BookStep => ({
  kind: 'book',
  idempotencyKey: `book:${id}`,
  slotKey: `gc:${id}`,
  courtId: `c-${id}`,
  provider: 'PADELOO',
  start: T('18:00'),
  end: T('19:30'),
  purpose: 'move',
  extraMinutes: 0,
  requiresVerifyBeforeRetry: true,
  ...extra,
});
const reassign: ReassignCourtStep = {
  kind: 'reassign_court',
  idempotencyKey: 'reassign:1',
  slotKey: 'gc:b',
  gameCourtId: 'b',
  fromCourtId: 'c-old',
  toCourtId: 'c-b',
};
const save: SaveGameStep = { kind: 'save_game', idempotencyKey: 'save', start: T('18:00'), end: T('19:30') };
const unlink: UnlinkStep = {
  kind: 'unlink',
  idempotencyKey: 'unlink:1',
  slotKey: 'gc:s',
  linkId: 'l-s',
  externalBookingId: 'ext-shared',
};
const moveShared: MoveSharedGameStep = {
  kind: 'move_shared_game',
  idempotencyKey: 'move-shared',
  slotKey: 'gc:s',
  gameId: 'g2',
  name: 'Late mix',
  start: T('19:30'),
  end: T('20:30'),
};
const cancel = (ext: string, provider = 'PADELOO'): CancelStep => ({
  kind: 'cancel',
  idempotencyKey: `cancel:${ext}`,
  slotKey: 'gc:a',
  linkId: `l-${ext}`,
  externalBookingId: ext,
  provider,
});
const manualClub: ManualClubStep = {
  kind: 'manual_club',
  idempotencyKey: 'manual-club',
  slotKey: 'any:0',
  courtId: null,
  provider: null,
  linkIds: [],
  reason: 'reported',
  start: T('18:00'),
  end: T('19:30'),
};

type Call = string;

function fakeExecutors(opts: {
  failBook?: Record<string, number>;
  failSave?: unknown;
  savedAnyway?: boolean;
  failCancel?: string[];
  failMoveShared?: number;
  existing?: BookResult[];
  noFind?: boolean;
} = {}) {
  const calls: Call[] = [];
  const failBook = { ...(opts.failBook ?? {}) };
  let failMoveShared = opts.failMoveShared ?? 0;
  let saveContext: SaveGameContext | null = null;
  let counter = 0;
  const executors: ReservationExecutors = {
    async book(step) {
      calls.push(`book:${step.courtId}`);
      if ((failBook[step.courtId] ?? 0) > 0) {
        failBook[step.courtId] -= 1;
        throw new Error('slot_taken');
      }
      counter += 1;
      return { externalBookingId: `new-${step.courtId}-${counter}`, bookingStart: step.start, bookingEnd: step.end };
    },
    ...(opts.noFind
      ? {}
      : {
          async findExistingBooking(step: BookStep, exclude: readonly string[]) {
            calls.push(`find:${step.courtId}`);
            return (
              (opts.existing ?? []).find(
                (b) => b.bookingStart === step.start && !exclude.includes(b.externalBookingId),
              ) ?? null
            );
          },
        }),
    async cancelBooking(_provider, ext) {
      calls.push(`cancel:${ext}`);
      if (opts.failCancel?.includes(ext)) throw new Error('cancel_failed');
    },
    async saveGame(step, context) {
      calls.push(`save:${step.start}`);
      saveContext = context;
      if (opts.failSave) throw opts.failSave;
    },
    async isGameSaved() {
      calls.push('isSaved');
      return Boolean(opts.savedAnyway);
    },
    async moveSharedGame(step) {
      calls.push(`moveShared:${step.gameId}`);
      if (failMoveShared > 0) {
        failMoveShared -= 1;
        throw new Error('forbidden');
      }
    },
  };
  return { executors, calls, getSaveContext: () => saveContext };
}

function deps(executors: ReservationExecutors, extra: Partial<RunnerDeps> = {}): RunnerDeps {
  let tick = 0;
  return {
    executors,
    canCancel: (p) => p === 'PADELOO' || p === 'BOOKTIME',
    now: () => `2026-06-12T10:00:${String(tick++ % 60).padStart(2, '0')}.000Z`,
    ...extra,
  };
}

const statuses = (j: RunJournal) => j.steps.map((s) => `${s.key}=${s.status}`);

describe('runReservationChanges — happy path', () => {
  it('books, saves atomically with links/reassign/unlinks, cancels the old reservation', async () => {
    const steps: PlanStep[] = [book('a'), book('b'), reassign, save, unlink, moveShared, cancel('ext-old'), manualClub];
    const { executors, calls, getSaveContext } = fakeExecutors();
    const store = createMemoryRunJournalStore();
    const journal = await runReservationChanges(createRunJournal('game1', steps), deps(executors, { store }));

    expect(journal.phase).toBe('done');
    expect(calls).toEqual([
      'book:c-a',
      'book:c-b',
      `save:${T('18:00')}`,
      'moveShared:g2',
      'cancel:ext-old',
    ]);
    expect(statuses(journal)).toEqual([
      'book:a=done',
      'book:b=done',
      'reassign:1=done',
      'save=done',
      'unlink:1=done',
      'move-shared=done',
      'cancel:ext-old=done',
      'manual-club=follow_up',
    ]);
    const ctx = getSaveContext()!;
    expect(ctx.linksToAdd.map((l) => [l.slotKey, l.booking.externalBookingId])).toEqual([
      ['gc:a', 'new-c-a-1'],
      ['gc:b', 'new-c-b-2'],
    ]);
    expect(ctx.reassignments).toEqual([reassign]);
    expect(ctx.linksToRemove.sort()).toEqual(['ext-old', 'ext-shared']);
    expect(journal.followUps.map((f) => f.reason)).toEqual(['manual_club']);
    expect(store.snapshot('game1')?.phase).toBe('done');
  });
});

describe('runReservationChanges — failure before save', () => {
  it('rolls back earlier bookings it can cancel and reports the rest as left at the club', async () => {
    const steps: PlanStep[] = [
      book('a', { provider: 'PADELOO' }),
      book('w', { provider: 'WELTNER', requiresVerifyBeforeRetry: false }),
      book('b'),
      save,
      cancel('ext-old'),
    ];
    const { executors, calls } = fakeExecutors({ failBook: { 'c-b': 1 } });
    const journal = await runReservationChanges(createRunJournal('game1', steps), deps(executors));

    expect(journal.phase).toBe('rolled_back');
    // The failed booking is looked up too: it may have landed although the call failed.
    expect(calls).toEqual(['book:c-a', 'book:c-w', 'book:c-b', 'find:c-b', 'cancel:new-c-a-1']);
    expect(statuses(journal)).toEqual([
      'book:a=rolled_back',
      'book:w=left_at_club',
      'book:b=failed',
      'save=skipped',
      'cancel:ext-old=skipped',
    ]);
    expect(journal.followUps).toEqual([
      expect.objectContaining({ reason: 'left_at_club', provider: 'WELTNER', externalBookingId: 'new-c-w-2' }),
    ]);
    expect(journal.error?.message).toBe('slot_taken');
  });

  it('a rollback cancel that fails leaves the booking at the club', async () => {
    const { executors } = fakeExecutors({ failBook: { 'c-b': 1 }, failCancel: ['new-c-a-1'] });
    const journal = await runReservationChanges(
      createRunJournal('game1', [book('a'), book('b'), save]),
      deps(executors),
    );
    expect(statuses(journal)[0]).toBe('book:a=left_at_club');
    expect(journal.followUps[0]).toMatchObject({ reason: 'left_at_club', externalBookingId: 'new-c-a-1' });
  });

  it('a server clash on save rolls back and exposes the clash blocks', async () => {
    const clash = {
      response: {
        status: 409,
        data: { code: 'court.clash', message: 'clash', details: [{ courtId: 'c-a', start: T('18:00'), end: T('19:00'), kind: 'club' }] },
      },
    };
    const { executors, calls } = fakeExecutors({ failSave: clash });
    const journal = await runReservationChanges(createRunJournal('game1', [book('a'), reassign, save]), deps(executors));
    expect(journal.phase).toBe('rolled_back');
    expect(calls).toContain('cancel:new-c-a-1');
    expect(statuses(journal)).toEqual(['book:a=rolled_back', 'reassign:1=skipped', 'save=failed']);
    expect(journal.error?.code).toBe(RUN_ERROR.clash);
    expect(clashDetailsOf(journal)).toEqual([{ courtId: 'c-a', start: T('18:00'), end: T('19:00'), kind: 'club' }]);
  });

  it('a save that failed for us but landed on the server continues instead of rolling back', async () => {
    const { executors, calls } = fakeExecutors({ failSave: new Error('timeout'), savedAnyway: true });
    const journal = await runReservationChanges(createRunJournal('game1', [book('a'), save, cancel('ext-old')]), deps(executors));
    expect(journal.phase).toBe('done');
    expect(calls).toEqual(['book:c-a', `save:${T('18:00')}`, 'isSaved', 'cancel:ext-old']);
  });
});

describe('runReservationChanges — resume after the app was killed', () => {
  function killedJournal(stepsOverride?: PlanStep[]): RunJournal {
    const journal = createRunJournal('game1', stepsOverride ?? [book('a'), book('b'), save, cancel('ext-old')]);
    journal.steps[0] = {
      ...journal.steps[0],
      status: 'done',
      attempts: 1,
      booking: { externalBookingId: 'kept-a', bookingStart: T('18:00'), bookingEnd: T('19:30'), provider: 'PADELOO', courtId: 'c-a' },
    };
    journal.steps[1] = { ...journal.steps[1], status: 'running', attempts: 1 };
    return journal;
  }

  it('is offered as unfinished and adopts the in-flight booking instead of booking twice', async () => {
    const journal = killedJournal();
    expect(isUnfinished(journal)).toBe(true);
    const { executors, calls, getSaveContext } = fakeExecutors({
      existing: [{ externalBookingId: 'landed-b', bookingStart: T('18:00'), bookingEnd: T('19:30') }],
    });
    const done = await runReservationChanges(journal, deps(executors));
    expect(done.phase).toBe('done');
    expect(calls).toEqual(['find:c-b', `save:${T('18:00')}`, 'cancel:ext-old']);
    expect(done.steps[1].booking).toMatchObject({ externalBookingId: 'landed-b', adopted: true });
    expect(getSaveContext()!.linksToAdd.map((l) => l.booking.externalBookingId)).toEqual(['kept-a', 'landed-b']);
  });

  it('books again when the lookup finds nothing', async () => {
    const { executors, calls } = fakeExecutors({ existing: [] });
    const done = await runReservationChanges(killedJournal(), deps(executors));
    expect(calls.slice(0, 2)).toEqual(['find:c-b', 'book:c-b']);
    expect(done.phase).toBe('done');
  });

  it('an idempotent provider is simply retried without a lookup', async () => {
    const journal = killedJournal([book('a'), book('b', { provider: 'WELTNER', requiresVerifyBeforeRetry: false }), save]);
    const { executors, calls } = fakeExecutors();
    await runReservationChanges(journal, deps(executors));
    expect(calls[0]).toBe('book:c-b');
  });

  it('never retries a non-idempotent booking without a lookup: rolls back instead', async () => {
    const { executors, calls } = fakeExecutors({ noFind: true });
    const done = await runReservationChanges(killedJournal(), deps(executors));
    expect(calls).toEqual(['cancel:kept-a']);
    expect(done.phase).toBe('rolled_back');
    expect(done.steps[1]).toMatchObject({ status: 'failed', error: { code: RUN_ERROR.verifyUnavailable } });
  });

  it('"Undo" on an unfinished run cancels the bookings it already made, including one that landed in flight', async () => {
    const { executors, calls } = fakeExecutors({
      existing: [{ externalBookingId: 'landed-b', bookingStart: T('18:00'), bookingEnd: T('19:30') }],
    });
    const undone = await rollbackReservationChanges(killedJournal(), deps(executors));
    expect(undone.phase).toBe('rolled_back');
    expect(calls).toEqual(['find:c-b', 'cancel:landed-b', 'cancel:kept-a']);
  });
});

describe('runReservationChanges — after the save', () => {
  it('a failed cancellation becomes a "Cancel at the club" follow-up; the run still completes', async () => {
    const { executors } = fakeExecutors({ failCancel: ['ext-old'] });
    const journal = await runReservationChanges(createRunJournal('game1', [book('a'), save, cancel('ext-old')]), deps(executors));
    expect(journal.phase).toBe('done');
    expect(statuses(journal)).toEqual(['book:a=done', 'save=done', 'cancel:ext-old=follow_up']);
    expect(journal.followUps).toEqual([
      expect.objectContaining({ reason: 'cancel_failed', externalBookingId: 'ext-old', provider: 'PADELOO' }),
    ]);
  });

  it('another post-save failure pauses (no rollback) and resumes from where it stopped', async () => {
    const steps = [book('a'), save, moveShared, cancel('ext-old')];
    const first = fakeExecutors({ failMoveShared: 1 });
    const paused = await runReservationChanges(createRunJournal('game1', steps), deps(first.executors));
    expect(paused.phase).toBe('paused');
    expect(first.calls).not.toContain('cancel:new-c-a-1');
    expect(isUnfinished(paused)).toBe(true);

    const second = fakeExecutors();
    const done = await runReservationChanges(paused, deps(second.executors));
    expect(second.calls).toEqual(['moveShared:g2', 'cancel:ext-old']);
    expect(done.phase).toBe('done');
  });
});

describe('runReservationChanges — server journal mirror', () => {
  function fakeServer(failSteps = 0) {
    const ops: Array<MirrorOp | { kind: 'create' }> = [];
    let remainingFailures = failSteps;
    const server: ServerRunJournal = {
      async create() {
        ops.push({ kind: 'create' });
        return { id: 'run-1' };
      },
      async step(_runId, op) {
        if (remainingFailures > 0) {
          remainingFailures -= 1;
          throw new Error('offline');
        }
        ops.push(op);
      },
      async finish(_runId, phase) {
        ops.push({ kind: 'finish', phase });
      },
    };
    return { server, ops };
  }

  it('creates the run once, mirrors every transition in order and finishes', async () => {
    const { server, ops } = fakeServer();
    const { executors, getSaveContext } = fakeExecutors();
    const journal = await runReservationChanges(createRunJournal('game1', [book('a'), save]), deps(executors, { server }));
    expect(ops.filter((o) => o.kind === 'create')).toHaveLength(1);
    expect(getSaveContext()!.runId).toBe('run-1');
    const stepOps = ops.filter((o): o is Extract<MirrorOp, { kind: 'step' }> => o.kind === 'step');
    // save_game is not mirrored: the atomic save records it server-side.
    expect(stepOps.map((o) => `${o.key}=${o.status}`)).toEqual(['book:a=running', 'book:a=running', 'book:a=done']);
    expect(stepOps[1].result?.externalBookingId).toBe('new-c-a-1');
    expect(ops[ops.length - 1]).toEqual({ kind: 'finish', phase: 'done' });
    expect(journal.mirrorQueue).toEqual([]);
  });

  it('queues mirror writes while the server is unreachable and flushes them later', async () => {
    const { server, ops } = fakeServer(100);
    const { executors } = fakeExecutors();
    const journal = await runReservationChanges(createRunJournal('game1', [book('a'), save]), deps(executors, { server }));
    expect(journal.phase).toBe('done');
    expect(journal.mirrorQueue.length).toBeGreaterThan(0);

    const recovered = fakeServer(0);
    const flushed = await flushRunMirror(journal, deps(executors, { server: recovered.server }));
    expect(flushed.mirrorQueue).toEqual([]);
    expect(recovered.ops.some((o) => o.kind === 'finish')).toBe(true);
    expect(ops.filter((o) => o.kind !== 'create')).toEqual([]);
  });

  const otherRunning = {
    response: {
      status: 409,
      data: { success: false, message: 'reservationChange.running', code: 'reservationChange.running', active: { id: 'run-other', createdById: 'u1' } },
    },
  };
  const refusingServer = (): ServerRunJournal & { creates: number; writes: number } => {
    const s = {
      creates: 0,
      writes: 0,
      async create() {
        s.creates += 1;
        throw otherRunning;
      },
      async step() {
        s.writes += 1;
      },
      async finish() {
        s.writes += 1;
      },
    };
    return s;
  };

  it('409 "another change is running": runs nothing — no booking, no separate save — and exposes the active run', async () => {
    const server = refusingServer();
    const { executors, calls } = fakeExecutors();
    const store = createMemoryRunJournalStore();
    const journal = await runReservationChanges(
      createRunJournal('game1', [book('a'), reassign, save, cancel('ext-old')]),
      deps(executors, { server, store }),
    );
    expect(calls).toEqual([]);
    expect(server.creates).toBe(1);
    expect(server.writes).toBe(0);
    expect(journal.phase).toBe('rolled_back');
    expect(isUnfinished(journal)).toBe(false);
    expect(isBlockedByOtherRun(journal)).toBe(true);
    expect(activeRunOf(journal)).toMatchObject({ id: 'run-other', createdById: 'u1' });
    expect(journal.steps.every((r) => r.status === 'pending')).toBe(true);
    expect(journal.mirrorQueue).toEqual([]);
    expect(store.snapshot('game1')?.error?.code).toBe(RUN_ERROR.otherRunning);
  });

  it('409 on resume: a half-done run stays unfinished and untouched (no rollback, no calls)', async () => {
    const journal = createRunJournal('game1', [book('a'), book('b'), save]);
    journal.steps[0] = {
      ...journal.steps[0],
      status: 'done',
      attempts: 1,
      booking: { externalBookingId: 'kept-a', bookingStart: T('18:00'), bookingEnd: T('19:30'), provider: 'PADELOO', courtId: 'c-a' },
    };
    const { executors, calls } = fakeExecutors();
    const out = await runReservationChanges(journal, deps(executors, { server: refusingServer() }));
    expect(calls).toEqual([]);
    expect(out.phase).toBe('running');
    expect(isUnfinished(out)).toBe(true);
    expect(isBlockedByOtherRun(out)).toBe(true);
    expect(out.steps[0].booking?.externalBookingId).toBe('kept-a');
  });

  it('any other create failure keeps the old behaviour: the run goes ahead without a server run id', async () => {
    const server: ServerRunJournal = {
      async create() {
        throw new Error('offline');
      },
      async step() {},
      async finish() {},
    };
    const { executors, getSaveContext } = fakeExecutors();
    const journal = await runReservationChanges(createRunJournal('game1', [book('a'), save]), deps(executors, { server }));
    expect(journal.phase).toBe('done');
    expect(getSaveContext()!.runId).toBeNull();
  });
});
