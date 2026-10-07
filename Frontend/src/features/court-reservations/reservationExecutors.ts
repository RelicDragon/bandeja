/**
 * Real executors for {@link runReservationChanges}: club adapters
 * (`createHydratedClubBookingProvider`; Weltner through `/api/weltner`) and
 * the Bandeja API (`courtSlotsApi`). Everything external is behind `deps`.
 *
 * Times: plan steps are UTC instants; providers take the CLUB's wall clock
 * (`yyyy-MM-dd` + `HH:mm`) and may answer in naive local time, which is
 * normalized back with the club's zone before anything is stored.
 *
 * The save is `POST /reservation-changes/:id/save-game` (atomic, replay-safe):
 * time + new links + slot list + dropped links in one call. Without a server
 * run (journal endpoint refused) the same body is applied call by call.
 */
import type { Club } from '@/types';
import type { BookSlotContext, BookSlotParams, ClubBookingProvider } from '@/integrations/booking/ClubBookingProvider';
import type { ExternalBookingResult } from '@shared/booking';
import { booktimeIsoToUtcIso } from '@shared/booktime/localTime';
import { parseInstantMs } from '@shared/gameBooking/coverageIntervals';
import type { BookStep, PlanStep, SaveGameStep } from '@shared/gameBooking/planReschedule';
import { resolveProviderCapabilities } from '@shared/gameBooking/providerCapabilities';
import { isWeltnerClub } from '@shared/clubIntegration';
import type {
  CreateReservationChangeBody,
  ReservationChange,
  ReservationChangeSaveBody,
  ReservationChangeStepStatus,
} from '@/api/courtSlots';
import { createClubTimeFormatter, minutesBetweenIso } from './clubTime';
import { isSyntheticGameCourtId } from './courtReservationsInput';
import { buildCourtSlotsBody, type CourtSlotsState } from './courtReservationsModel';
import type {
  BookResult,
  MirrorOp,
  ReservationExecutors,
  RunJournal,
  RunPhase,
  RunStepStatus,
  SaveGameContext,
  ServerRunJournal,
} from './reservationRunner';

const NOOP_CONTEXT: BookSlotContext = {
  refreshSnapshot: async () => true,
  lastFetchedAt: null,
};

export type WeltnerReceiptLike = {
  externalBookingId: string;
  courtId: string;
  bookingStart: string;
  bookingEnd: string;
  state: string;
};

export type ReservationExecutorDeps = {
  createProvider(club: Club, durationMinutes: number): Promise<ClubBookingProvider | null>;
  weltnerBook(clubId: string, body: { courtId: string; date: string; startTime: string; durationMinutes: number }): Promise<WeltnerReceiptLike>;
  weltnerBookings(clubId: string): Promise<WeltnerReceiptLike[]>;
  saveAtomic(changeId: string, body: ReservationChangeSaveBody): Promise<unknown>;
  /** Fallback when no server run exists. */
  saveSeparately(gameId: string, body: ReservationChangeSaveBody): Promise<void>;
  loadGameWindow(gameId: string): Promise<{ startTime: string; endTime: string } | null>;
  saveGameTime(gameId: string, window: { startTime: string; endTime: string }): Promise<unknown>;
};

export type ReservationExecutorEnv = {
  gameId: string;
  club: Club;
  timeZone: string;
  /** The game's slots before the run (reassignments are applied on top). */
  slots: CourtSlotsState;
};

export function gameCourtIdFromSlotKey(slotKey: string): string | null {
  if (!slotKey.startsWith('gc:')) return null;
  const id = slotKey.slice(3);
  return isSyntheticGameCourtId(id) ? null : id;
}

function normalizeInstant(raw: string, timeZone: string): string {
  return booktimeIsoToUtcIso(raw, timeZone) ?? raw;
}

function sameInstant(a: string, b: string): boolean {
  const x = parseInstantMs(a);
  const y = parseInstantMs(b);
  return x != null && y != null && x === y;
}

/** Run context → `save-game` body. `slotUpdates` only when courts change. */
export function buildSaveBody(
  step: { start: string; end: string },
  ctx: SaveGameContext,
  slots: CourtSlotsState,
): ReservationChangeSaveBody {
  let slotUpdates: ReservationChangeSaveBody['slotUpdates'];
  if (ctx.reassignments.length > 0) {
    let state = slots;
    for (const r of ctx.reassignments) {
      const body = buildCourtSlotsBody(state, { kind: 'reassign_court', fromCourtId: r.fromCourtId, toCourtId: r.toCourtId });
      state = {
        gameCourts: body.slots.map((s, i) => ({
          gameCourtId: state.gameCourts.find((gc) => gc.courtId === s.courtId)?.gameCourtId ?? `new:${s.courtId}`,
          courtId: s.courtId,
          order: i + 1,
          reservation: s.reservation,
        })),
        reportedAnyCourtCount: body.reportedAnyCourtCount,
        courtSlotCount: body.courtSlotCount ?? state.courtSlotCount ?? null,
      };
      slotUpdates = body;
    }
  }
  return {
    startTime: step.start,
    endTime: step.end,
    ...(slotUpdates ? { slotUpdates } : {}),
    linksToAdd: ctx.linksToAdd.map(({ slotKey, courtId, booking }) => {
      const gameCourtId = gameCourtIdFromSlotKey(slotKey);
      return {
        externalBookingId: booking.externalBookingId,
        snapshot: {
          externalBookingId: booking.externalBookingId,
          courtId,
          bookingStart: booking.bookingStart,
          bookingEnd: booking.bookingEnd,
        },
        ...(gameCourtId ? { gameCourtId } : {}),
      };
    }),
    linksToRemove: ctx.linksToRemove,
  };
}

export function createReservationExecutors(env: ReservationExecutorEnv, deps: ReservationExecutorDeps): ReservationExecutors {
  const clock = createClubTimeFormatter({ timeZone: env.timeZone });
  const weltner = isWeltnerClub(env.club);
  const providers = new Map<number, Promise<ClubBookingProvider | null>>();
  const providerFor = (minutes: number) => {
    let p = providers.get(minutes);
    if (!p) {
      p = deps.createProvider(env.club, minutes);
      providers.set(minutes, p);
    }
    return p;
  };

  const bookParams = (step: BookStep): BookSlotParams => {
    const wall = clock.wallClock(step.start);
    const court = env.club.courts?.find((c) => c.id === step.courtId);
    if (!wall) throw new Error('invalid_time');
    if (!court?.externalCourtId && !weltner) throw new Error('no_external_court');
    return {
      courtId: step.courtId,
      externalCourtId: court?.externalCourtId ?? '',
      courtName: court?.name ?? step.courtId,
      dateKey: wall.dateKey,
      startTime: wall.time,
      durationMinutes: minutesBetweenIso(step.start, step.end),
      sport: court?.sport ?? null,
    };
  };

  const normalize = (r: Pick<ExternalBookingResult, 'externalBookingId' | 'bookingStart' | 'bookingEnd'>): BookResult => ({
    externalBookingId: r.externalBookingId,
    bookingStart: normalizeInstant(r.bookingStart, env.timeZone),
    bookingEnd: normalizeInstant(r.bookingEnd, env.timeZone),
  });

  return {
    async book(step) {
      const params = bookParams(step);
      if (weltner) {
        const receipt = await deps.weltnerBook(env.club.id, {
          courtId: step.courtId,
          date: params.dateKey,
          startTime: params.startTime,
          durationMinutes: params.durationMinutes,
        });
        if (receipt.state !== 'CONFIRMED') throw new Error('booking_unconfirmed');
        return normalize(receipt);
      }
      const provider = await providerFor(params.durationMinutes);
      if (!provider) throw new Error('not_connected');
      const result = await provider.bookSlot(params, new Date(`${params.dateKey}T12:00:00`), NOOP_CONTEXT);
      return normalize(result);
    },

    async findExistingBooking(step, excludeIds) {
      const matches = (b: BookResult) =>
        !excludeIds.includes(b.externalBookingId) && sameInstant(b.bookingStart, step.start) && sameInstant(b.bookingEnd, step.end);
      if (weltner) {
        const receipts = await deps.weltnerBookings(env.club.id);
        return receipts.filter((r) => r.state === 'CONFIRMED' && r.courtId === step.courtId).map(normalize).find(matches) ?? null;
      }
      const provider = await providerFor(minutesBetweenIso(step.start, step.end));
      if (!provider) throw new Error('not_connected');
      const upcoming = await provider.listUpcoming();
      // Same time is not enough: the organizer may hold another court then (another game, an
      // agent booking). Adopting it would link the wrong court, and a rollback would cancel it.
      const { externalCourtId } = bookParams(step);
      const atTime = upcoming.filter((b) => matches(normalize(b)));
      const sameCourt = atTime.filter((b) => b.externalCourtId != null && String(b.externalCourtId) === String(externalCourtId));
      if (sameCourt.length > 0) return normalize(sameCourt[0]);
      // Provider gave no court: only an unambiguous single booking at that time.
      const courtless = atTime.filter((b) => b.externalCourtId == null);
      return atTime.length === 1 && courtless.length === 1 ? normalize(courtless[0]) : null;
    },

    async cancelBooking(providerName, externalBookingId) {
      if (!resolveProviderCapabilities(providerName)?.canCancel) throw new Error('cancel_via_club');
      const provider = await providerFor(60);
      if (!provider) throw new Error('not_connected');
      await provider.cancelBooking(externalBookingId, NOOP_CONTEXT.refreshSnapshot);
    },

    async saveGame(step, ctx) {
      const body = buildSaveBody(step, ctx, env.slots);
      if (ctx.runId) await deps.saveAtomic(ctx.runId, body);
      else await deps.saveSeparately(env.gameId, body);
    },

    async isGameSaved(step) {
      const window = await deps.loadGameWindow(env.gameId);
      return Boolean(window && sameInstant(window.startTime, step.start) && sameInstant(window.endTime, step.end));
    },

    async moveSharedGame(step) {
      await deps.saveGameTime(step.gameId, { startTime: step.start, endTime: step.end });
    },
  };
}

/** Production deps (lazy imports keep the adapters out of the game-page chunk until a run starts). */
export function defaultReservationExecutorDeps(): ReservationExecutorDeps {
  const api = async () => (await import('@/api/courtSlots')).courtSlotsApi;
  return {
    createProvider: async (club, durationMinutes) =>
      (await import('@/integrations/booking/createClubBookingProvider')).createHydratedClubBookingProvider(club, {
        durationMinutes,
      }),
    weltnerBook: async (clubId, body) => (await import('@/api/weltner')).weltnerApi.book(clubId, body),
    weltnerBookings: async (clubId) => (await import('@/api/weltner')).weltnerApi.bookings(clubId),
    saveAtomic: async (changeId, body) => (await api()).saveReservationChangeGame(changeId, body),
    saveSeparately: async (gameId, body) => {
      const courtSlotsApi = await api();
      await courtSlotsApi.saveGameTime(gameId, { startTime: body.startTime, endTime: body.endTime });
      for (const link of body.linksToAdd ?? []) await courtSlotsApi.linkBooking(gameId, link);
      if (body.slotUpdates) await courtSlotsApi.putCourtSlots(gameId, body.slotUpdates);
      if (body.linksToRemove && body.linksToRemove.length > 0) await courtSlotsApi.unlinkBookings(gameId, body.linksToRemove);
    },
    loadGameWindow: async (gameId) => {
      const { gamesApi } = await import('@/api/games');
      const game = (await gamesApi.getById(gameId)).data;
      return game ? { startTime: game.startTime, endTime: game.endTime } : null;
    },
    saveGameTime: async (gameId, window) => (await api()).saveGameTime(gameId, window),
  };
}

/* ------------------------------------------------------------------ *
 * Server journal
 * ------------------------------------------------------------------ */

const TO_SERVER_STATUS: Record<RunStepStatus, ReservationChangeStepStatus> = {
  pending: 'PENDING',
  running: 'RUNNING',
  done: 'DONE',
  failed: 'FAILED',
  skipped: 'SKIPPED',
  follow_up: 'NEEDS_CLUB',
  // A booking undone by a rollback: the step did not take effect.
  rolled_back: 'SKIPPED',
  left_at_club: 'NEEDS_CLUB',
};

const FROM_SERVER_STATUS: Record<ReservationChangeStepStatus, RunStepStatus> = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  NEEDS_CLUB: 'follow_up',
};

export function toServerStepStatus(status: RunStepStatus): ReservationChangeStepStatus {
  return TO_SERVER_STATUS[status];
}

export function toServerFinishState(phase: RunPhase): 'COMPLETED' | 'ROLLED_BACK' | null {
  return phase === 'done' ? 'COMPLETED' : phase === 'rolled_back' ? 'ROLLED_BACK' : null;
}

/**
 * 4xx = the server will never accept this write (monotonic step status,
 * finished run, …): drop it so the mirror queue cannot jam. Network / 5xx
 * errors are rethrown and retried on the next write.
 */
async function bestEffort(call: () => Promise<unknown>): Promise<void> {
  try {
    await call();
  } catch (err) {
    const status = (err as { response?: { status?: number } } | null)?.response?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) return;
    throw err;
  }
}

export function createReservationChangeBody(journal: RunJournal): CreateReservationChangeBody | null {
  const to = journal.targetWindow;
  const from = journal.fromWindow ?? to;
  if (!to || !from) return null;
  return {
    plan: { steps: journal.steps.map((r) => ({ ...r.step })) },
    fromStart: from.start,
    fromEnd: from.end,
    toStart: to.start,
    toEnd: to.end,
  };
}

/** Server journal over `courtSlotsApi`; the runner retries what throws. */
export function createServerRunJournal(gameId: string): ServerRunJournal {
  const api = async () => (await import('@/api/courtSlots')).courtSlotsApi;
  return {
    create: async (journal: RunJournal) => {
      const body = createReservationChangeBody(journal);
      if (!body) throw new Error('missing_window');
      const { change } = await (await api()).createReservationChange(gameId, body);
      return { id: change.id };
    },
    step: (changeId, op: Extract<MirrorOp, { kind: 'step' }>) =>
      bestEffort(async () =>
        (await api()).patchReservationChangeStep(changeId, op.key, {
          status: toServerStepStatus(op.status),
          ...(op.result ? { result: op.result } : {}),
          ...(op.error ? { error: op.error } : {}),
        }),
      ),
    finish: (changeId, phase) =>
      bestEffort(async () => {
        const state = toServerFinishState(phase);
        if (state) await (await api()).finishReservationChange(changeId, state);
      }),
  };
}

export function providerCanCancel(provider: string): boolean {
  return Boolean(resolveProviderCapabilities(provider)?.canCancel);
}

/**
 * Another device's running change → a local journal, rebuilt from
 * `plan.steps` (the full steps this app sent) + per-step server status.
 * Anything we cannot rebuild safely → `null` (no banner rather than a wrong one).
 */
export function journalFromServerRun(gameId: string, change: ReservationChange | null): RunJournal | null {
  if (!change || change.state !== 'RUNNING') return null;
  const planned = Array.isArray(change.plan?.steps) ? change.plan!.steps : [];
  if (planned.length === 0) return null;
  const statusByKey = new Map(change.steps.map((s) => [s.idempotencyKey, s]));
  const steps: RunJournal['steps'] = [];
  for (const raw of planned) {
    const step = raw as unknown as PlanStep;
    if (typeof step.kind !== 'string' || typeof step.idempotencyKey !== 'string') return null;
    const server = statusByKey.get(step.idempotencyKey);
    const status = server ? FROM_SERVER_STATUS[server.status] ?? 'pending' : 'pending';
    const result = server?.result as RunJournal['steps'][number]['booking'] | undefined;
    steps.push({
      key: step.idempotencyKey,
      step,
      status,
      attempts: status === 'pending' ? 0 : 1,
      ...(result && typeof result.externalBookingId === 'string' ? { booking: result } : {}),
    });
  }
  const saved = steps.some((r) => r.step.kind === 'save_game' && r.status === 'done');
  const save = steps.find((r) => r.step.kind === 'save_game')?.step as SaveGameStep | undefined;
  return {
    version: 2,
    gameId,
    fromWindow: { start: change.fromStart, end: change.fromEnd },
    targetWindow: save ? { start: save.start, end: save.end } : { start: change.toStart, end: change.toEnd },
    createdAt: change.createdAt,
    updatedAt: change.updatedAt,
    phase: saved ? 'paused' : 'running',
    steps,
    followUps: [],
    serverRunId: change.id,
    mirrorQueue: [],
  };
}

export function createServerJournalLoader(gameId: string): () => Promise<RunJournal | null> {
  return async () => {
    const { courtSlotsApi } = await import('@/api/courtSlots');
    return journalFromServerRun(gameId, await courtSlotsApi.getActiveReservationChange(gameId));
  };
}
