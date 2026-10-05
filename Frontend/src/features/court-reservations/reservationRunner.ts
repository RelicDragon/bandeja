/**
 * Executes a reschedule's steps in order, journaled so a killed app can finish.
 *
 * Pure-ish: every side effect goes through injected {@link ReservationExecutors}
 * (club + Bandeja calls), an optional {@link ServerRunJournal} mirror and a
 * local {@link RunJournalStore}; the clock is injected. The local journal is
 * written BEFORE each call (status `running`, attempts+1) and AFTER it, so on
 * the next launch a `running` step means "may or may not have happened".
 *
 * Rules (docs/domains/booking.md — reschedule):
 *  - `book` only books at the club; the booking is journaled at once. Nothing
 *    is linked yet.
 *  - A retried `book` whose provider is not idempotent
 *    (`requiresVerifyBeforeRetry`) first lists the user's upcoming bookings
 *    and adopts a matching one instead of booking twice. No lookup → no retry.
 *  - `save_game` is ONE atomic, idempotent server call: new time, the new
 *    links (this run's bookings), court reassignments and links to drop
 *    (`unlink` steps and the reservations being cancelled). So
 *    `reassign_court` and `unlink` steps complete together with the save.
 *  - Anything failing before the save has landed rolls back: bookings made by
 *    this run are cancelled where the provider can cancel; the rest are
 *    reported as "left at the club". The game keeps its old time.
 *  - After the save, a failed cancellation never fails the run: it becomes a
 *    "Cancel at the club" follow-up. Other post-save failures pause the run
 *    (resumable — the game already moved).
 *  - `manual_cancel` / `manual_club` are follow-ups, never calls.
 *  - Every step transition is mirrored to the server journal, best effort:
 *    failed mirror writes queue in the journal and are retried on the next
 *    write, so another device can offer "Finish changes".
 *  - If the server refuses to create the run because another change is
 *    running for this game (409 `reservationChange.running`), NOTHING runs —
 *    no fallback to separate, non-atomic calls. The journal carries the
 *    active run (`error.details.active`) so the UI can offer "Finish it"
 *    (ours) or ask to wait. Stale runs are abandoned by the server itself.
 */
import type {
  BookStep,
  MoveSharedGameStep,
  PlanStep,
  ReassignCourtStep,
  SaveGameStep,
} from '@shared/gameBooking/planReschedule';
import type { IsoInterval } from '@shared/gameBooking/coverageIntervals';

export type RunStepStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'follow_up'
  | 'rolled_back'
  | 'left_at_club';

export type BookedReservation = {
  externalBookingId: string;
  bookingStart: string;
  bookingEnd: string;
  provider: string;
  courtId: string;
  /** Found in the user's bookings on retry instead of booked again. */
  adopted?: boolean;
};

/** Machine-readable failure (e.g. a `court.clash` 409 on save). */
export type RunErrorInfo = {
  code: string;
  message: string;
  details?: unknown;
};

export type RunStepRecord = {
  key: string;
  step: PlanStep;
  status: RunStepStatus;
  attempts: number;
  booking?: BookedReservation;
  error?: RunErrorInfo;
};

export type RunFollowUpReason = 'manual_cancel' | 'manual_club' | 'cancel_failed' | 'left_at_club';

export type RunFollowUp = {
  key: string;
  reason: RunFollowUpReason;
  provider: string | null;
  courtId: string | null;
  externalBookingId?: string;
  start?: string;
  end?: string;
};

/**
 * - `running`: in progress, or the app died mid-run (resumable);
 * - `done`: every automatic step finished (follow-ups may remain);
 * - `rolled_back`: failed before the save; the game kept its time;
 * - `paused`: failed after the save; the game moved; resumable.
 */
export type RunPhase = 'running' | 'done' | 'rolled_back' | 'paused';

export type MirrorOp =
  | { kind: 'step'; key: string; status: RunStepStatus; result?: BookedReservation; error?: RunErrorInfo }
  | { kind: 'finish'; phase: RunPhase };

export type RunJournal = {
  version: 2;
  gameId: string;
  /** The game's time before the run (server journal `fromStart`/`fromEnd`). */
  fromWindow?: IsoInterval | null;
  targetWindow: IsoInterval | null;
  createdAt: string;
  updatedAt: string;
  phase: RunPhase;
  steps: RunStepRecord[];
  followUps: RunFollowUp[];
  error?: RunErrorInfo;
  /** Server-side run id once created. */
  serverRunId?: string | null;
  /** Mirror writes not yet accepted by the server, oldest first. */
  mirrorQueue: MirrorOp[];
};

export type BookResult = { externalBookingId: string; bookingStart: string; bookingEnd: string };

export type SaveGameContext = {
  runId: string | null;
  /** Bookings made (or adopted) by this run, with the slot they reserve. */
  linksToAdd: Array<{ slotKey: string; courtId: string; booking: BookedReservation }>;
  /** Court reassignments to apply with the save. */
  reassignments: ReassignCourtStep[];
  /** Provider booking ids this game stops using (unlinks + reservations being cancelled). */
  linksToRemove: string[];
};

export type ReservationExecutors = {
  book(step: BookStep): Promise<BookResult>;
  /** The user's upcoming booking matching `step` (court/time), excluding `excludeIds`. */
  findExistingBooking?(step: BookStep, excludeIds: readonly string[]): Promise<BookResult | null>;
  cancelBooking(provider: string, externalBookingId: string): Promise<void>;
  /** Atomic + idempotent: time, links, slots in one call. */
  saveGame(step: SaveGameStep, context: SaveGameContext): Promise<void>;
  /** After a failed save: did it land anyway (e.g. timed-out response)? */
  isGameSaved?(step: SaveGameStep): Promise<boolean>;
  moveSharedGame(step: MoveSharedGameStep): Promise<void>;
};

/** Server journal (`/games/:id/reservation-changes`). All calls are best effort. */
export type ServerRunJournal = {
  create(journal: RunJournal): Promise<{ id: string }>;
  step(runId: string, op: Extract<MirrorOp, { kind: 'step' }>): Promise<void>;
  finish(runId: string, phase: RunPhase): Promise<void>;
};

export type RunJournalStore = {
  load(gameId: string): RunJournal | null;
  save(journal: RunJournal): void;
  clear(gameId: string): void;
};

export type RunnerDeps = {
  executors: ReservationExecutors;
  /** Provider can cancel through its API (rollback / `cancel` steps). */
  canCancel: (provider: string) => boolean;
  store?: RunJournalStore;
  server?: ServerRunJournal;
  now?: () => string;
  onUpdate?: (journal: RunJournal) => void;
};

export const RUN_ERROR = {
  verifyUnavailable: 'verify_unavailable',
  unknown: 'unknown_error',
  clash: 'court.clash',
  /** Another reservation change is running for this game (server 409). */
  otherRunning: 'reservationChange.running',
} as const;

/** The other run the server reported (`409 reservationChange.running` → `active`). */
export type ActiveRunRef = {
  id: string;
  createdById?: string | null;
  toStart?: string | null;
  toEnd?: string | null;
  stale?: boolean;
} & Record<string, unknown>;

/** Steps completed by the atomic save rather than by their own call. */
const FOLDED_INTO_SAVE: ReadonlySet<PlanStep['kind']> = new Set(['reassign_court', 'unlink']);

export function createRunJournal(
  gameId: string,
  steps: readonly PlanStep[],
  options: { targetWindow?: IsoInterval | null; fromWindow?: IsoInterval | null; now?: string } = {},
): RunJournal {
  const now = options.now ?? new Date().toISOString();
  const save = steps.find((s): s is SaveGameStep => s.kind === 'save_game');
  return {
    version: 2,
    gameId,
    fromWindow: options.fromWindow ?? null,
    targetWindow: options.targetWindow ?? (save ? { start: save.start, end: save.end } : null),
    createdAt: now,
    updatedAt: now,
    phase: 'running',
    steps: steps.map((step) => ({ key: step.idempotencyKey, step, status: 'pending', attempts: 0 })),
    followUps: [],
    serverRunId: null,
    mirrorQueue: [],
  };
}

/** Normalizes anything thrown (Error, axios error with `{ code, details }` body, string). */
export function toRunError(err: unknown): RunErrorInfo {
  const body =
    err && typeof err === 'object' && 'response' in err
      ? ((err as { response?: { data?: unknown } }).response?.data as Record<string, unknown> | undefined)
      : undefined;
  const source = (body ?? err) as Record<string, unknown> | string | null | undefined;
  if (source && typeof source === 'object') {
    const code = typeof source.code === 'string' ? source.code : undefined;
    const message =
      typeof source.message === 'string' && source.message
        ? source.message
        : err instanceof Error && err.message
          ? err.message
          : RUN_ERROR.unknown;
    const details = source.details !== undefined ? source.details : source.active !== undefined ? { active: source.active } : undefined;
    return { code: code ?? message, message, ...(details !== undefined ? { details } : {}) };
  }
  if (typeof source === 'string' && source) return { code: source, message: source };
  if (err instanceof Error && err.message) return { code: err.message, message: err.message };
  return { code: RUN_ERROR.unknown, message: RUN_ERROR.unknown };
}

/** The save landed (journal says so). */
export function isSaveDone(journal: RunJournal): boolean {
  return journal.steps.some((r) => r.step.kind === 'save_game' && r.status === 'done');
}

/** A journal the user should be asked about ("Finish changes"). */
export function isUnfinished(journal: RunJournal | null | undefined): journal is RunJournal {
  return Boolean(journal && (journal.phase === 'running' || journal.phase === 'paused'));
}

/** A finished journal that still has things for the organizer to do at the club. */
export function hasOpenFollowUps(journal: RunJournal | null | undefined): boolean {
  return Boolean(journal && journal.phase !== 'running' && journal.followUps.length > 0);
}

/** The run was not started because another change is running for this game. */
export function isBlockedByOtherRun(journal: RunJournal | null | undefined): boolean {
  return journal?.error?.code === RUN_ERROR.otherRunning;
}

/** The other running change (from the 409 body), if the server sent it. */
export function activeRunOf(journal: RunJournal | null | undefined): ActiveRunRef | null {
  if (!isBlockedByOtherRun(journal)) return null;
  const active = (journal!.error!.details as { active?: unknown } | undefined)?.active;
  return active && typeof active === 'object' && typeof (active as { id?: unknown }).id === 'string' ? (active as ActiveRunRef) : null;
}

/** Clash blocks reported by the server on save (`court.clash` details), if any. */
export function clashDetailsOf(journal: RunJournal | null | undefined): Array<{
  courtId: string;
  start: string;
  end: string;
  kind?: string;
}> {
  const error = journal?.error;
  if (!error || error.code !== RUN_ERROR.clash || !Array.isArray(error.details)) return [];
  return (error.details as unknown[]).filter(
    (d): d is { courtId: string; start: string; end: string; kind?: string } =>
      Boolean(d) &&
      typeof (d as { courtId?: unknown }).courtId === 'string' &&
      typeof (d as { start?: unknown }).start === 'string' &&
      typeof (d as { end?: unknown }).end === 'string',
  );
}

class Run {
  journal: RunJournal;
  private readonly deps: RunnerDeps;
  /** One create attempt per run instance: a refused create must not be hammered on every write. */
  private createTried = false;
  /** The server said another change is running (409): this run must not touch anything. */
  private blockedBy: RunErrorInfo | null = null;

  constructor(journal: RunJournal, deps: RunnerDeps) {
    this.journal = JSON.parse(JSON.stringify(journal)) as RunJournal;
    this.journal.mirrorQueue = this.journal.mirrorQueue ?? [];
    this.deps = deps;
  }

  private now(): string {
    return this.deps.now?.() ?? new Date().toISOString();
  }

  private persist(): void {
    this.journal = {
      ...this.journal,
      updatedAt: this.now(),
      steps: [...this.journal.steps],
      followUps: [...this.journal.followUps],
      mirrorQueue: [...this.journal.mirrorQueue],
    };
    this.deps.store?.save(this.journal);
    this.deps.onUpdate?.(this.journal);
  }

  /** Persist locally, then try to drain the mirror queue. */
  async commit(): Promise<void> {
    this.persist();
    await this.flushMirror();
  }

  private async ensureServerRun(): Promise<string | null> {
    if (this.journal.serverRunId) return this.journal.serverRunId;
    if (!this.deps.server || this.createTried) return null;
    this.createTried = true;
    try {
      const { id } = await this.deps.server.create(this.journal);
      this.journal.serverRunId = id;
      this.persist();
      return id;
    } catch (err) {
      const error = toRunError(err);
      if (error.code === RUN_ERROR.otherRunning) this.blockedBy = error;
      return null;
    }
  }

  /** Nothing ran (or nothing more may run): hand the other run to the UI. */
  private stopForOtherRun(error: RunErrorInfo): RunJournal {
    this.journal.error = error;
    const untouched = this.journal.steps.every((r) => r.status === 'pending' && r.attempts === 0);
    if (untouched) {
      // Never started: nothing to undo, nothing to mirror (no server run of ours exists).
      this.journal.phase = 'rolled_back';
      this.journal.mirrorQueue = [];
    }
    this.persist();
    return this.journal;
  }

  private async flushMirror(): Promise<void> {
    const server = this.deps.server;
    if (!server || this.journal.mirrorQueue.length === 0) return;
    const runId = await this.ensureServerRun();
    if (!runId) return;
    while (this.journal.mirrorQueue.length > 0) {
      const op = this.journal.mirrorQueue[0];
      try {
        if (op.kind === 'step') await server.step(runId, op);
        else await server.finish(runId, op.phase);
      } catch {
        break;
      }
      this.journal.mirrorQueue = this.journal.mirrorQueue.slice(1);
      this.persist();
    }
  }

  private set(index: number, patch: Partial<RunStepRecord>): void {
    const next = { ...this.journal.steps[index], ...patch };
    this.journal.steps[index] = next;
    // The save step's server status is written by the atomic save itself.
    if (next.step.kind === 'save_game') return;
    this.journal.mirrorQueue.push({
      kind: 'step',
      key: next.key,
      status: next.status,
      ...(next.booking ? { result: next.booking } : {}),
      ...(next.error ? { error: next.error } : {}),
    });
  }

  private setPhase(phase: RunPhase): void {
    this.journal.phase = phase;
    // `paused` is still open on the server (resumable); only terminal phases finish it.
    if (phase === 'done' || phase === 'rolled_back') this.journal.mirrorQueue.push({ kind: 'finish', phase });
  }

  private addFollowUp(followUp: RunFollowUp): void {
    if (this.journal.followUps.some((f) => f.key === followUp.key)) return;
    this.journal.followUps.push(followUp);
  }

  private knownBookingIds(): string[] {
    return this.journal.steps.map((r) => r.booking?.externalBookingId).filter((id): id is string => Boolean(id));
  }

  private async begin(index: number): Promise<RunStepRecord> {
    const record = this.journal.steps[index];
    this.set(index, { status: 'running', attempts: record.attempts + 1, error: undefined });
    await this.commit();
    return record;
  }

  private async runBook(index: number, step: BookStep): Promise<void> {
    const before = await this.begin(index);
    if (before.booking) return;
    let found: BookResult | null = null;
    if (before.attempts > 0 && step.requiresVerifyBeforeRetry) {
      if (!this.deps.executors.findExistingBooking) throw new Error(RUN_ERROR.verifyUnavailable);
      found = await this.deps.executors.findExistingBooking(step, this.knownBookingIds());
    }
    const result = found ?? (await this.deps.executors.book(step));
    this.set(index, {
      booking: { ...result, provider: step.provider, courtId: step.courtId, ...(found ? { adopted: true } : {}) },
    });
    await this.commit();
  }

  private saveContext(): SaveGameContext {
    const linksToAdd: SaveGameContext['linksToAdd'] = [];
    const reassignments: ReassignCourtStep[] = [];
    const linksToRemove = new Set<string>();
    for (const record of this.journal.steps) {
      const step = record.step;
      if (step.kind === 'book' && record.booking) {
        linksToAdd.push({ slotKey: step.slotKey, courtId: step.courtId, booking: record.booking });
      } else if (step.kind === 'reassign_court') {
        reassignments.push(step);
      } else if (step.kind === 'unlink' || step.kind === 'cancel' || step.kind === 'manual_cancel') {
        linksToRemove.add(step.externalBookingId);
      }
    }
    return { runId: this.journal.serverRunId ?? null, linksToAdd, reassignments, linksToRemove: [...linksToRemove] };
  }

  private async runSave(index: number, step: SaveGameStep): Promise<void> {
    await this.begin(index);
    await this.ensureServerRun();
    const ex = this.deps.executors;
    try {
      await ex.saveGame(step, this.saveContext());
    } catch (err) {
      const landed = ex.isGameSaved ? await ex.isGameSaved(step).catch(() => false) : false;
      if (!landed) throw err;
    }
    // Reassignments and unlinks were part of the save.
    this.journal.steps.forEach((record, i) => {
      if (FOLDED_INTO_SAVE.has(record.step.kind) && record.status !== 'done') this.set(i, { status: 'done' });
    });
  }

  private async runCancel(index: number, step: Extract<PlanStep, { kind: 'cancel' | 'manual_cancel' }>): Promise<void> {
    if (step.kind === 'cancel') {
      await this.begin(index);
      try {
        await this.deps.executors.cancelBooking(step.provider, step.externalBookingId);
        this.set(index, { status: 'done' });
        return;
      } catch (err) {
        this.set(index, { status: 'follow_up', error: toRunError(err) });
      }
    } else {
      this.set(index, { status: 'follow_up' });
    }
    this.addFollowUp({
      key: step.idempotencyKey,
      reason: step.kind === 'cancel' ? 'cancel_failed' : 'manual_cancel',
      provider: step.provider,
      courtId: null,
      externalBookingId: step.externalBookingId,
    });
  }

  async forward(): Promise<RunJournal> {
    this.journal.phase = 'running';
    this.journal.error = undefined;
    await this.commit();
    await this.ensureServerRun();
    if (this.blockedBy) return this.stopForOtherRun(this.blockedBy);
    for (let index = 0; index < this.journal.steps.length; index += 1) {
      const record = this.journal.steps[index];
      if (record.status !== 'pending' && record.status !== 'running' && record.status !== 'failed') continue;
      const step = record.step;
      if (FOLDED_INTO_SAVE.has(step.kind)) continue;
      if (step.kind === 'manual_club') {
        this.set(index, { status: 'follow_up' });
        this.addFollowUp({
          key: step.idempotencyKey,
          reason: 'manual_club',
          provider: step.provider,
          courtId: step.courtId,
          start: step.start,
          end: step.end,
        });
        await this.commit();
        continue;
      }
      if (step.kind === 'cancel' || step.kind === 'manual_cancel') {
        await this.runCancel(index, step);
        await this.commit();
        continue;
      }
      try {
        if (step.kind === 'book') await this.runBook(index, step);
        else if (step.kind === 'save_game') await this.runSave(index, step);
        else if (step.kind === 'move_shared_game') {
          await this.begin(index);
          await this.deps.executors.moveSharedGame(step);
        }
        this.set(index, { status: 'done' });
        await this.commit();
      } catch (err) {
        const error = toRunError(err);
        this.set(index, { status: 'failed', error });
        this.journal.error = error;
        await this.commit();
        if (isSaveDone(this.journal)) {
          this.setPhase('paused');
          await this.commit();
          return this.journal;
        }
        return this.rollback();
      }
    }
    this.setPhase('done');
    await this.commit();
    return this.journal;
  }

  /** Undo what this run did before the save. Never throws. */
  async rollback(): Promise<RunJournal> {
    const ex = this.deps.executors;
    for (let index = this.journal.steps.length - 1; index >= 0; index -= 1) {
      const record = this.journal.steps[index];
      const step = record.step;
      if (step.kind !== 'book') continue;
      let booking = record.booking;
      if (!booking && record.attempts > 0 && step.requiresVerifyBeforeRetry && ex.findExistingBooking) {
        // The call may have landed even though it failed for us.
        const found = await ex.findExistingBooking(step, this.knownBookingIds()).catch(() => null);
        if (found) booking = { ...found, provider: step.provider, courtId: step.courtId, adopted: true };
      }
      if (!booking) {
        if (record.status === 'running') this.set(index, { status: 'failed' });
        continue;
      }
      let cancelled = false;
      if (this.deps.canCancel(step.provider)) {
        try {
          await ex.cancelBooking(step.provider, booking.externalBookingId);
          cancelled = true;
        } catch {
          cancelled = false;
        }
      }
      this.set(index, { status: cancelled ? 'rolled_back' : 'left_at_club', booking });
      if (!cancelled) {
        this.addFollowUp({
          key: `left:${booking.externalBookingId}`,
          reason: 'left_at_club',
          provider: step.provider,
          courtId: step.courtId,
          externalBookingId: booking.externalBookingId,
          start: booking.bookingStart,
          end: booking.bookingEnd,
        });
      }
      await this.commit();
    }
    for (let index = 0; index < this.journal.steps.length; index += 1) {
      const status = this.journal.steps[index].status;
      if (status === 'pending' || status === 'running') this.set(index, { status: 'skipped' });
    }
    this.setPhase('rolled_back');
    await this.commit();
    return this.journal;
  }
}

/** Run (or resume) a journal to completion, rollback or pause. Never throws. */
export async function runReservationChanges(journal: RunJournal, deps: RunnerDeps): Promise<RunJournal> {
  if (journal.phase === 'done' || journal.phase === 'rolled_back') return journal;
  const run = new Run(journal, deps);
  try {
    return await run.forward();
  } catch (err) {
    // Only a store/onUpdate failure lands here; keep the journal resumable.
    run.journal.error = toRunError(err);
    return run.journal;
  }
}

/** Undo an unfinished run that has not saved the game yet ("Undo" on the banner). */
export async function rollbackReservationChanges(journal: RunJournal, deps: RunnerDeps): Promise<RunJournal> {
  if (isSaveDone(journal) || journal.phase === 'done' || journal.phase === 'rolled_back') return journal;
  const run = new Run(journal, deps);
  try {
    return await run.rollback();
  } catch (err) {
    run.journal.error = toRunError(err);
    return run.journal;
  }
}

/** Retry the server mirror only (e.g. on app foreground). */
export async function flushRunMirror(journal: RunJournal, deps: RunnerDeps): Promise<RunJournal> {
  if (!deps.server || (journal.mirrorQueue ?? []).length === 0) return journal;
  const run = new Run(journal, deps);
  await run.commit();
  return run.journal;
}
