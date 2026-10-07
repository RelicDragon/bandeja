/**
 * Reschedule journal (docs/domains/booking.md "Reschedule journal").
 *
 * The client plans a reschedule (`planReschedule` in @bandeja/shared) and runs the provider
 * steps (book / cancel / ...) itself; the server keeps the run so another device — or the
 * same one after a crash — can see where it stopped. Rules:
 *  - one RUNNING change per game (Game row lock); a RUNNING change untouched for
 *    {@link RESERVATION_CHANGE_STALE_MS} is stale and is ABANDONED when a new run starts;
 *  - step status is monotonic ({@link canTransitionStep}); repeating the current status is a no-op;
 *  - the `save_game` step runs here, atomically: time (through `GameUpdateService` — one
 *    notice, attendance reset), court slots, links and the step's DONE mark in one
 *    transaction. A retry after DONE replays the stored result.
 *  - NEEDS_CLUB steps are the organizer's follow-ups ("tell the club"), listed on the game
 *    payload for organizers (`pendingClubFollowUps`) until marked DONE / SKIPPED.
 */
import {
  GameReservationChangeState,
  GameReservationChangeStepStatus,
  ParticipantRole,
  Prisma,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';
import { resolveBooktimeTimezoneForGame } from '../../shared/booktime/resolveClubTimezone';
import { assertNoCourtClashInTx } from '../gameCourt/courtClash.service';
import { GameCourtService } from '../gameCourt/gameCourt.service';
import { pruneEmptySlotsAboveCap } from '../gameCourt/courtSlots.tx';
import {
  createLinkInTx,
  gameExternalBookingSelect,
  parseLinkBookingToGameBody,
  placeNewLink,
  serializeLinkedBooking,
} from '../game/gameExternalBooking.service';
import { notifyGameBookingStatusChangeIfNeeded } from '../game/notifyGameBookingStatusChange';
import { GameUpdateService } from '../game/update.service';

type Tx = Prisma.TransactionClient;

export const RESERVATION_CHANGE_STALE_MS = 15 * 60 * 1000;
export const RESERVATION_CHANGE_MAX_STEPS = 200;
export const SAVE_GAME_STEP_KIND = 'save_game';

export const RESERVATION_CHANGE_ERRORS = {
  running: 'reservationChange.running',
  notRunning: 'reservationChange.notRunning',
  stepTransition: 'reservationChange.stepTransition',
  stepNotFound: 'reservationChange.stepNotFound',
  stepsOpen: 'reservationChange.stepsOpen',
  noSaveStep: 'reservationChange.noSaveStep',
  saveGameServerOnly: 'reservationChange.saveGameServerOnly',
  finishConflict: 'reservationChange.finishConflict',
} as const;

const S = GameReservationChangeStepStatus;

/** Allowed step transitions. Same status → no-op (handled by the caller). */
const STEP_TRANSITIONS: Readonly<Record<GameReservationChangeStepStatus, readonly GameReservationChangeStepStatus[]>> = {
  PENDING: [S.RUNNING, S.DONE, S.FAILED, S.SKIPPED, S.NEEDS_CLUB],
  RUNNING: [S.DONE, S.FAILED, S.SKIPPED, S.NEEDS_CLUB],
  // A failed step may be retried (or verified done, or handed to the club).
  FAILED: [S.RUNNING, S.DONE, S.SKIPPED, S.NEEDS_CLUB],
  NEEDS_CLUB: [S.DONE, S.SKIPPED],
  DONE: [],
  SKIPPED: [],
};

export function canTransitionStep(from: GameReservationChangeStepStatus, to: GameReservationChangeStepStatus): boolean {
  return from === to || STEP_TRANSITIONS[from].includes(to);
}

const FINISH_STATES: ReadonlySet<GameReservationChangeState> = new Set([
  GameReservationChangeState.COMPLETED,
  GameReservationChangeState.FAILED,
  GameReservationChangeState.ROLLED_BACK,
  GameReservationChangeState.ABANDONED,
]);

const changeInclude = { steps: true } satisfies Prisma.GameReservationChangeInclude;
type ChangeRow = Prisma.GameReservationChangeGetPayload<{ include: typeof changeInclude }>;

function apiError(status: number, code: string, extra: Record<string, unknown> = {}): ApiError {
  return new ApiError(status, code, true, { code, ...extra });
}

function planStepKeys(plan: unknown): string[] {
  const steps = (plan as { steps?: unknown })?.steps;
  if (!Array.isArray(steps)) return [];
  return steps
    .map((step) => (step && typeof step === 'object' ? (step as { idempotencyKey?: unknown }).idempotencyKey : null))
    .filter((key): key is string => typeof key === 'string');
}

function planStepByKey(plan: unknown, key: string): Record<string, unknown> | null {
  const steps = (plan as { steps?: unknown })?.steps;
  if (!Array.isArray(steps)) return null;
  const found = steps.find(
    (step) => step && typeof step === 'object' && (step as { idempotencyKey?: unknown }).idempotencyKey === key,
  );
  return (found as Record<string, unknown>) ?? null;
}

export function isStale(change: { state: GameReservationChangeState; updatedAt: Date }, now = new Date()): boolean {
  return (
    change.state === GameReservationChangeState.RUNNING &&
    now.getTime() - change.updatedAt.getTime() > RESERVATION_CHANGE_STALE_MS
  );
}

export function serializeReservationChange(change: ChangeRow, now = new Date()) {
  const order = new Map(planStepKeys(change.plan).map((key, index) => [key, index]));
  const steps = [...change.steps].sort(
    (a, b) =>
      (order.get(a.idempotencyKey) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.idempotencyKey) ?? Number.MAX_SAFE_INTEGER) ||
      a.idempotencyKey.localeCompare(b.idempotencyKey),
  );
  return {
    id: change.id,
    gameId: change.gameId,
    createdById: change.createdById,
    state: change.state,
    stale: isStale(change, now),
    plan: change.plan,
    fromStart: change.fromStart.toISOString(),
    fromEnd: change.fromEnd.toISOString(),
    toStart: change.toStart.toISOString(),
    toEnd: change.toEnd.toISOString(),
    createdAt: change.createdAt.toISOString(),
    updatedAt: change.updatedAt.toISOString(),
    steps: steps.map((step) => ({
      id: step.id,
      idempotencyKey: step.idempotencyKey,
      kind: step.kind,
      status: step.status,
      result: step.result ?? null,
      error: step.error ?? null,
      updatedAt: step.updatedAt.toISOString(),
    })),
  };
}

export type SerializedReservationChange = ReturnType<typeof serializeReservationChange>;

async function assertCanEdit(gameId: string, userId: string, isAdmin: boolean): Promise<void> {
  const ok = await hasParentGamePermission(gameId, userId, [ParticipantRole.OWNER, ParticipantRole.ADMIN], isAdmin);
  if (!ok) throw new ApiError(403, 'Only owners and admins can change the reservation');
}

async function loadChange(changeId: string, client: Tx | typeof prisma = prisma): Promise<ChangeRow> {
  const change = await client.gameReservationChange.findUnique({ where: { id: changeId }, include: changeInclude });
  if (!change) throw new ApiError(404, 'Reservation change not found');
  return change;
}

async function loadChangeForEditor(changeId: string, userId: string, isAdmin: boolean): Promise<ChangeRow> {
  const change = await loadChange(changeId);
  await assertCanEdit(change.gameId, userId, isAdmin);
  return change;
}

async function lockChange(tx: Tx, changeId: string): Promise<ChangeRow> {
  await tx.$executeRaw(Prisma.sql`SELECT id FROM "GameReservationChange" WHERE id = ${changeId} FOR UPDATE`);
  return loadChange(changeId, tx);
}

function touch(tx: Tx, changeId: string) {
  return tx.gameReservationChange.update({ where: { id: changeId }, data: { updatedAt: new Date() } });
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

function parseInstant(raw: unknown, field: string): Date {
  if (typeof raw !== 'string') throw new ApiError(400, `${field} must be an ISO date-time`);
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new ApiError(400, `${field} must be an ISO date-time`);
  return date;
}

function parseWindow(src: Record<string, unknown>, startKey: string, endKey: string) {
  const start = parseInstant(src[startKey], startKey);
  const end = parseInstant(src[endKey], endKey);
  if (end.getTime() <= start.getTime()) throw new ApiError(400, `${endKey} must be after ${startKey}`);
  return { start, end };
}

export type CreateReservationChangeBody = {
  plan: Prisma.InputJsonValue;
  steps: Array<{ idempotencyKey: string; kind: string }>;
  from: { start: Date; end: Date };
  to: { start: Date; end: Date };
};

export function parseCreateReservationChangeBody(body: unknown): CreateReservationChangeBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'plan is required');
  const src = body as Record<string, unknown>;
  const plan = src.plan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new ApiError(400, 'plan must be an object');
  const rawSteps = (plan as { steps?: unknown }).steps;
  if (!Array.isArray(rawSteps)) throw new ApiError(400, 'plan.steps must be an array');
  if (rawSteps.length > RESERVATION_CHANGE_MAX_STEPS) {
    throw new ApiError(400, `At most ${RESERVATION_CHANGE_MAX_STEPS} steps`);
  }
  const seen = new Set<string>();
  const steps: CreateReservationChangeBody['steps'] = [];
  for (const raw of rawSteps) {
    const step = raw as { idempotencyKey?: unknown; kind?: unknown } | null;
    const key = typeof step?.idempotencyKey === 'string' ? step.idempotencyKey.trim() : '';
    const kind = typeof step?.kind === 'string' ? step.kind.trim() : '';
    if (!key || key.length > 512 || !kind || kind.length > 64) {
      throw new ApiError(400, 'Every plan step needs an idempotencyKey and a kind');
    }
    if (seen.has(key)) continue;
    seen.add(key);
    steps.push({ idempotencyKey: key, kind });
  }
  if (steps.filter((step) => step.kind === SAVE_GAME_STEP_KIND).length > 1) {
    throw new ApiError(400, 'At most one save_game step');
  }
  return {
    plan: plan as Prisma.InputJsonValue,
    steps,
    from: parseWindow(src, 'fromStart', 'fromEnd'),
    to: parseWindow(src, 'toStart', 'toEnd'),
  };
}

const STEP_STATUSES = new Set<string>(Object.values(GameReservationChangeStepStatus));

export function parsePatchStepBody(body: unknown): {
  status: GameReservationChangeStepStatus;
  result?: Prisma.InputJsonValue;
  error?: string | null;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'status is required');
  const src = body as Record<string, unknown>;
  if (typeof src.status !== 'string' || !STEP_STATUSES.has(src.status)) {
    throw new ApiError(400, `status must be one of ${[...STEP_STATUSES].join(', ')}`);
  }
  if (src.error != null && typeof src.error !== 'string') throw new ApiError(400, 'error must be a string');
  return {
    status: src.status as GameReservationChangeStepStatus,
    ...(src.result !== undefined && src.result !== null ? { result: src.result as Prisma.InputJsonValue } : {}),
    ...(src.error !== undefined ? { error: src.error === null ? null : String(src.error).slice(0, 2000) } : {}),
  };
}

export type SaveGameBody = {
  startTime: Date;
  endTime: Date;
  slotUpdates?: unknown;
  linksToAdd: Array<ReturnType<typeof parseLinkBookingToGameBody>>;
  linksToRemove: string[];
};

export function parseSaveGameBody(body: unknown): SaveGameBody {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'startTime is required');
  const src = body as Record<string, unknown>;
  const { start, end } = parseWindow(src, 'startTime', 'endTime');
  const linksToAddRaw = src.linksToAdd ?? [];
  const linksToRemoveRaw = src.linksToRemove ?? [];
  if (!Array.isArray(linksToAddRaw)) throw new ApiError(400, 'linksToAdd must be an array');
  if (!Array.isArray(linksToRemoveRaw)) throw new ApiError(400, 'linksToRemove must be an array');
  const linksToAdd = linksToAddRaw.map((raw) => {
    const parsed = parseLinkBookingToGameBody(raw);
    if (parsed.gamePatch) throw new ApiError(400, 'linksToAdd entries take no gamePatch');
    return parsed;
  });
  const linksToRemove = linksToRemoveRaw.map((raw) => {
    if (typeof raw !== 'string' || !raw.trim()) throw new ApiError(400, 'linksToRemove holds link ids or externalBookingIds');
    return raw.trim();
  });
  return {
    startTime: start,
    endTime: end,
    ...(src.slotUpdates !== undefined && src.slotUpdates !== null ? { slotUpdates: src.slotUpdates } : {}),
    linksToAdd,
    linksToRemove,
  };
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

/**
 * `POST /games/:id/reservation-changes`. Another RUNNING change → 409
 * `reservationChange.running` (with `active`), unless it is stale (ABANDONED, then created)
 * or it is the same run being re-posted by its creator (same target window and step keys →
 * returned with `resumed: true`).
 */
export async function createReservationChange(
  gameId: string,
  userId: string,
  isAdmin: boolean,
  body: unknown,
  now: Date = new Date(),
): Promise<{ change: SerializedReservationChange; resumed: boolean; abandonedId: string | null }> {
  await assertCanEdit(gameId, userId, isAdmin);
  const input = parseCreateReservationChangeBody(body);

  const out = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "Game" WHERE id = ${gameId} FOR UPDATE`);
    const game = await tx.game.findUnique({ where: { id: gameId }, select: { id: true } });
    if (!game) throw new ApiError(404, 'Game not found');

    let abandonedId: string | null = null;
    const running = await tx.gameReservationChange.findFirst({
      where: { gameId, state: GameReservationChangeState.RUNNING },
      include: changeInclude,
      orderBy: { createdAt: 'desc' },
    });
    if (running) {
      if (isStale(running, now)) {
        await tx.gameReservationChange.update({
          where: { id: running.id },
          data: { state: GameReservationChangeState.ABANDONED },
        });
        abandonedId = running.id;
      } else {
        const sameRun =
          running.createdById === userId &&
          running.toStart.getTime() === input.to.start.getTime() &&
          running.toEnd.getTime() === input.to.end.getTime() &&
          running.steps.length === input.steps.length &&
          input.steps.every((step) => running.steps.some((row) => row.idempotencyKey === step.idempotencyKey));
        if (sameRun) return { change: running, resumed: true, abandonedId };
        throw apiError(409, RESERVATION_CHANGE_ERRORS.running, { active: serializeReservationChange(running, now) });
      }
    }

    const created = await tx.gameReservationChange.create({
      data: {
        gameId,
        createdById: userId,
        plan: input.plan,
        fromStart: input.from.start,
        fromEnd: input.from.end,
        toStart: input.to.start,
        toEnd: input.to.end,
        steps: { createMany: { data: input.steps } },
      },
      include: changeInclude,
    });
    return { change: created, resumed: false, abandonedId };
  });
  return { change: serializeReservationChange(out.change, now), resumed: out.resumed, abandonedId: out.abandonedId };
}

/** `GET /games/:id/reservation-changes/active` — the RUNNING change (with `stale`) or null. */
export async function getActiveReservationChange(gameId: string, userId: string, isAdmin: boolean) {
  await assertCanEdit(gameId, userId, isAdmin);
  const running = await prisma.gameReservationChange.findFirst({
    where: { gameId, state: GameReservationChangeState.RUNNING },
    include: changeInclude,
    orderBy: { createdAt: 'desc' },
  });
  return running ? serializeReservationChange(running) : null;
}

/**
 * `PATCH /reservation-changes/:id/steps/:idempotencyKey` `{ status, result?, error? }`.
 * Monotonic ({@link canTransitionStep}); the same status again is a no-op that keeps the
 * stored result. On a finished change only NEEDS_CLUB → DONE / SKIPPED is accepted.
 * `save_game` cannot be marked DONE here (it runs through `save-game`).
 */
export async function patchReservationChangeStep(
  changeId: string,
  idempotencyKey: string,
  userId: string,
  isAdmin: boolean,
  body: unknown,
): Promise<SerializedReservationChange> {
  const input = parsePatchStepBody(body);
  await loadChangeForEditor(changeId, userId, isAdmin);

  const updated = await prisma.$transaction(async (tx) => {
    const change = await lockChange(tx, changeId);
    const step = change.steps.find((row) => row.idempotencyKey === idempotencyKey);
    if (!step) throw apiError(404, RESERVATION_CHANGE_ERRORS.stepNotFound, { idempotencyKey });
    if (step.status === input.status) return change;
    if (step.kind === SAVE_GAME_STEP_KIND && input.status === S.DONE) {
      throw apiError(400, RESERVATION_CHANGE_ERRORS.saveGameServerOnly);
    }
    if (!canTransitionStep(step.status, input.status)) {
      throw apiError(409, RESERVATION_CHANGE_ERRORS.stepTransition, { from: step.status, to: input.status });
    }
    if (change.state !== GameReservationChangeState.RUNNING && step.status !== S.NEEDS_CLUB) {
      throw apiError(409, RESERVATION_CHANGE_ERRORS.notRunning, { state: change.state });
    }
    await tx.gameReservationChangeStep.update({
      where: { id: step.id },
      data: {
        status: input.status,
        ...(input.result !== undefined ? { result: input.result } : {}),
        ...(input.error !== undefined ? { error: input.error } : {}),
      },
    });
    await touch(tx, changeId);
    return loadChange(changeId, tx);
  });
  return serializeReservationChange(updated);
}

/**
 * `POST /reservation-changes/:id/finish` `{ state }`. Only from RUNNING; the same final state
 * again is a no-op. COMPLETED needs every step settled (none PENDING / RUNNING).
 */
export async function finishReservationChange(
  changeId: string,
  userId: string,
  isAdmin: boolean,
  body: unknown,
): Promise<SerializedReservationChange> {
  const state = (body as { state?: unknown } | null)?.state;
  if (typeof state !== 'string' || !FINISH_STATES.has(state as GameReservationChangeState)) {
    throw new ApiError(400, `state must be one of ${[...FINISH_STATES].join(', ')}`);
  }
  const target = state as GameReservationChangeState;
  await loadChangeForEditor(changeId, userId, isAdmin);

  const updated = await prisma.$transaction(async (tx) => {
    const change = await lockChange(tx, changeId);
    if (change.state === target) return change;
    if (change.state !== GameReservationChangeState.RUNNING) {
      throw apiError(409, RESERVATION_CHANGE_ERRORS.finishConflict, { state: change.state });
    }
    if (target === GameReservationChangeState.COMPLETED) {
      const open = change.steps.filter((step) => step.status === S.PENDING || step.status === S.RUNNING);
      if (open.length > 0) {
        throw apiError(409, RESERVATION_CHANGE_ERRORS.stepsOpen, { keys: open.map((step) => step.idempotencyKey) });
      }
    }
    await tx.gameReservationChange.update({ where: { id: changeId }, data: { state: target } });
    return loadChange(changeId, tx);
  });
  return serializeReservationChange(updated);
}

class SaveGameAlreadyDone extends Error {}

/**
 * `POST /reservation-changes/:id/save-game`
 * `{ startTime, endTime, slotUpdates?, linksToAdd?, linksToRemove? }`.
 *
 * One transaction (`GameUpdateService.updateGame` with `timePolicy=explicit`): the time
 * (schedule tracking → one notice, attendance reset), then links removed (by link id or
 * externalBookingId), the court slots (`slotUpdates` = the `PUT court-slots` body), links
 * added (`POST link-booking` bodies without `gamePatch`, `gameCourtId` honoured; an already
 * linked booking is only re-placed), the clash guard, and the step's DONE mark with its
 * result. Any failure rolls all of it back and marks the step FAILED. A retry after DONE
 * returns the stored result (`replayed: true`) and writes nothing.
 */
export async function saveGameForReservationChange(
  changeId: string,
  userId: string,
  isAdmin: boolean,
  body: unknown,
) {
  const change = await loadChangeForEditor(changeId, userId, isAdmin);
  const step = change.steps.find((row) => row.kind === SAVE_GAME_STEP_KIND);
  if (!step) throw apiError(409, RESERVATION_CHANGE_ERRORS.noSaveStep);
  const replay = async () => {
    const fresh = await loadChange(changeId);
    const saved = fresh.steps.find((row) => row.id === step.id);
    return { replayed: true, result: saved?.result ?? null, change: serializeReservationChange(fresh) };
  };
  if (step.status === S.DONE) return replay();
  if (change.state !== GameReservationChangeState.RUNNING) {
    throw apiError(409, RESERVATION_CHANGE_ERRORS.notRunning, { state: change.state });
  }
  if (!canTransitionStep(step.status, S.DONE)) {
    throw apiError(409, RESERVATION_CHANGE_ERRORS.stepTransition, { from: step.status, to: S.DONE });
  }
  const input = parseSaveGameBody(body);
  const gameId = change.gameId;

  const before = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      startTime: true,
      endTime: true,
      bookingStatus: true,
      gameCourts: { select: { courtId: true } },
    },
  });
  if (!before) throw new ApiError(404, 'Game not found');
  const timeZone = await resolveBooktimeTimezoneForGame(gameId);
  const result: { startTime: string; endTime: string; addedLinkIds: string[]; removedLinks: number } = {
    startTime: input.startTime.toISOString(),
    endTime: input.endTime.toISOString(),
    addedLinkIds: [],
    removedLinks: 0,
  };

  try {
    await GameUpdateService.updateGame(
      gameId,
      { startTime: input.startTime.toISOString(), endTime: input.endTime.toISOString() },
      userId,
      isAdmin,
      {
        timePolicy: 'explicit',
        clashGuard: false,
        slotsAuthoritative: true,
        inTx: {
          beforeSync: async (tx) => {
            const locked = await lockChange(tx, changeId);
            const lockedStep = locked.steps.find((row) => row.id === step.id);
            if (lockedStep?.status === S.DONE) throw new SaveGameAlreadyDone();
            if (locked.state !== GameReservationChangeState.RUNNING) {
              throw apiError(409, RESERVATION_CHANGE_ERRORS.notRunning, { state: locked.state });
            }
            if (input.linksToRemove.length > 0) {
              const removed = await tx.gameExternalBooking.deleteMany({
                where: {
                  gameId,
                  OR: [{ id: { in: input.linksToRemove } }, { externalBookingId: { in: input.linksToRemove } }],
                },
              });
              result.removedLinks = removed.count;
            }
            if (input.slotUpdates !== undefined) {
              await GameCourtService.writeCourtSlotsInTx(tx, gameId, userId, input.slotUpdates);
            }
            for (const add of input.linksToAdd) {
              const existing = await tx.gameExternalBooking.findFirst({
                where: { gameId, externalBookingId: add.externalBookingId },
                select: { id: true, courtId: true },
              });
              if (existing) {
                if (add.gameCourtId) await placeNewLink(tx, gameId, existing, add.gameCourtId);
                result.addedLinkIds.push(existing.id);
                continue;
              }
              const link = await createLinkInTx(tx, gameId, userId, add, timeZone);
              result.addedLinkIds.push(link.id);
            }
            if (result.removedLinks > 0) await pruneEmptySlotsAboveCap(tx, gameId);
          },
          afterSync: async (tx) => {
            const windowMoved =
              before.startTime.getTime() !== input.startTime.getTime() ||
              before.endTime.getTime() !== input.endTime.getTime();
            if (windowMoved) {
              await assertNoCourtClashInTx(tx, gameId);
            } else {
              const known = new Set(before.gameCourts.map((slot) => slot.courtId));
              const now = await tx.gameCourt.findMany({ where: { gameId }, select: { courtId: true } });
              await assertNoCourtClashInTx(tx, gameId, {
                onlyCourtIds: new Set(now.map((slot) => slot.courtId).filter((courtId) => !known.has(courtId))),
              });
            }
            await tx.gameReservationChangeStep.update({
              where: { id: step.id },
              data: { status: S.DONE, result, error: null },
            });
            await touch(tx, changeId);
          },
        },
      },
    );
  } catch (error) {
    if (error instanceof SaveGameAlreadyDone) return replay();
    const message = error instanceof Error ? error.message : String(error);
    await prisma.gameReservationChangeStep
      .updateMany({
        where: { id: step.id, status: { in: [S.PENDING, S.RUNNING] } },
        data: { status: S.FAILED, error: message.slice(0, 2000) },
      })
      .catch(() => undefined);
    throw error;
  }

  // The hook's slot write synced booking status before the update's own sync.
  await notifyGameBookingStatusChangeIfNeeded(gameId, before.bookingStatus);
  const fresh = await loadChange(changeId);
  const links = await prisma.gameExternalBooking.findMany({
    where: { gameId },
    orderBy: { createdAt: 'asc' },
    select: gameExternalBookingSelect,
  });
  return {
    replayed: false,
    result,
    change: serializeReservationChange(fresh),
    linkedBookings: links.map(serializeLinkedBooking),
  };
}

/**
 * Organizer follow-ups left by reschedule runs: NEEDS_CLUB steps of any run of the game
 * (newest first), with the plan step they came from.
 */
export async function listPendingClubFollowUps(gameId: string) {
  const steps = await prisma.gameReservationChangeStep.findMany({
    where: { status: S.NEEDS_CLUB, change: { gameId } },
    include: { change: { select: { id: true, plan: true, state: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  return steps.map((step) => ({
    changeId: step.change.id,
    changeState: step.change.state,
    idempotencyKey: step.idempotencyKey,
    kind: step.kind,
    error: step.error ?? null,
    updatedAt: step.updatedAt.toISOString(),
    step: planStepByKey(step.change.plan, step.idempotencyKey),
  }));
}

/**
 * `pendingClubFollowUps` for the game payload: present only for organizers (owner/admin of
 * the game or its parent, global admins) and only when there is at least one; absent = none.
 */
export async function pendingClubFollowUpsForViewer(
  gameId: string,
  viewerId: string | undefined,
  viewerIsAdmin: boolean,
): Promise<Awaited<ReturnType<typeof listPendingClubFollowUps>> | undefined> {
  if (!viewerId) return undefined;
  const count = await prisma.gameReservationChangeStep.count({
    where: { status: S.NEEDS_CLUB, change: { gameId } },
  });
  if (count === 0) return undefined;
  const organizer = await hasParentGamePermission(
    gameId,
    viewerId,
    [ParticipantRole.OWNER, ParticipantRole.ADMIN],
    viewerIsAdmin,
  );
  return organizer ? listPendingClubFollowUps(gameId) : undefined;
}
