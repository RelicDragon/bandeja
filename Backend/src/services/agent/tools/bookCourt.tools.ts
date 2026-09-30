/**
 * `book_court {slotRef, gameId?}` (booking plan §14.6, slice 7d): books the court(s) of a slot
 * the server offered to this user (`find_available_slots` → signed `slotRef`, or the
 * `[slot:<ref>]` token the app appends to a user message). Critical: always a confirmation card.
 *
 * Server-side (§14.5 (i)): Nspadel and Weltner, through the same services as the app's HTTP
 * routes, so both leave a local receipt (`NspadelBooking` / `WeltnerBooking`) whose idempotency
 * key makes a repeated court booking a no-op. Clubs without an integration get a "contact the
 * club" refusal.
 *
 * Client-executed (§14.5 (ii), slice 7g): Booktime / Padeloo / Klikteren are booked by the app
 * on Confirm (`proposeClientExecutedAction`; the server never calls those providers). Proposed
 * with or without the `booking-v1` cap: Telegram / old builds show "Open in app" and get 409
 * CLIENT_EXECUTION_REQUIRED on `/confirm`. Connected = the user's provider auth row for the club
 * (the app still checks its own session and reports `not_connected`). `rollbackOnPartial`: the
 * app cancels already-booked courts when a later one fails. Post-step (`bookCourtClientPostStep`):
 * upsert the new bookings into the user's mirror, then link them to `gameId` or hand off to
 * `/create-game?…bookingIds=`.
 *
 * `slotRef` at confirm / claim: verified as of the proposal time (`plan.proposedAt`), so an
 * action proposed while its ref was valid can still be confirmed after the ref's 15 min TTL
 * (the pending action has its own TTL, and execution re-checks live). Signature and owner are
 * always checked; a slot that already started is always expired.
 *
 * Guards at propose AND confirm (fresh principal): `verifySlotRef` (signature, owner, 15 min
 * TTL) → the club still has that provider and the courts → with `gameId`: agent game
 * visibility (404) → `canMutateGameBookings` (403) → same club → connected (Weltner: phone
 * saved for the club; Nspadel: profile first + last name and phone, like the app).
 *
 * Execute: a live re-check of every planned court (uncached) → if any court is taken, FAILED
 * "nothing booked"; else book court by court. Nspadel and Weltner can't roll back, so a later
 * court failing leaves EXECUTED `partial` ("2 of 3 courts booked"). With `gameId` each booked
 * court is linked (`linkBookingToGame`, ids and times from the provider response), else a
 * `/create-game?…bookingIds=` handoff. An unconfirmed upstream answer is UNKNOWN: FAILED with
 * `changed: true` when nothing else was booked ("check with the club").
 */
import { ClubIntegrationType, NspadelBookingState } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod/v4';
import type { AgentActionPreview, AgentActionPreviewLine, AgentClientPlan, AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import { canMutateGameBookings } from '../../../shared/gameBooking/bookingLinkAuthorization';
import { upsertAgentBookedMirrorRows } from '../../bookingMirror/externalBookingMirror.service';
import { linkBookingToGame } from '../../game/gameExternalBooking.service';
import {
  createNspadelBooking,
  getNspadelAvailability,
  nspadelIdempotencyKey,
  parseTimeToMinutes,
} from '../../nspadel/nspadelBookings.service';
import { createWeltnerBooking, getWeltnerAvailability } from '../../weltner/weltner.service';
import { assertAgentCanViewGame } from '../access/agentGameAccess';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { proposeAgentAction } from '../agentActionPropose';
import { resolveBookingRef } from '../booking/agentBookingSources';
import { isClientExecutedPlan, proposeClientExecutedAction, readClientExecutedPlan } from '../clientExecution/clientPlan';
import { registerAgentClientPostStep, type AgentClientPostStepInput } from '../clientExecution/clientPostSteps';
import { verifySlotRef, type SlotRefPayload } from '../booking/slotEngine/slotRef';
import { agentBookingEntity } from '../dto/booking.dto';
import { agentGameTitle } from '../dto/game.dto';
import { agentBookingT } from '../i18n/agentBookingI18n';
import { agentT, formatAgentDateTime } from '../i18n/agentI18n';
import {
  defineTool,
  type AgentToolContext,
  type AgentToolResult,
  type AgentWriteContext,
  type AgentWriteOutcome,
} from './registry';
import { clip, gameEntityFor, line, loadGameForWrite, parsePlan } from './writeHelpers';

/** Providers the backend books itself. */
export const SERVER_PROVIDERS = [ClubIntegrationType.NSPADELSUPABASE, ClubIntegrationType.WELTNER] as const;
export type ServerProvider = (typeof SERVER_PROVIDERS)[number];

/** Providers the app books on Confirm (client-executed, slice 7g); all of them can cancel. */
export const CLIENT_PROVIDERS = [ClubIntegrationType.BOOKTIME, ClubIntegrationType.PADELOO, ClubIntegrationType.KLIKTEREN] as const;
export type ClientProvider = (typeof CLIENT_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<ServerProvider | ClientProvider, string> = {
  NSPADELSUPABASE: 'NS Padel',
  WELTNER: 'Weltner',
  BOOKTIME: 'Booktime',
  PADELOO: 'Padeloo',
  KLIKTEREN: 'Klikteren',
};

/** Same shape the app's cards emit in `[slot:<ref>]` tokens (docs/domains/agent.md). */
export const SLOT_REF = z
  .string()
  .min(1)
  .max(512)
  .describe(
    'slotRef from find_available_slots, or the ref inside a [slot:<ref>] token at the end of the user message, passed unchanged',
  );

const bookCourtInput = z
  .object({
    slotRef: SLOT_REF,
    gameId: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe('Game to link the booked court(s) to; the user must organise it (owner or admin) and it must be at the same club'),
  })
  .strict();

export const bookCourtPlanSchema = z
  .object({
    slotRef: z.string(),
    clubId: z.string(),
    courtIds: z.array(z.string()).min(1),
    start: z.string(),
    durationMinutes: z.number().int().positive(),
    provider: z.enum(SERVER_PROVIDERS),
    gameId: z.string().nullable(),
    /** ISO; the slotRef is verified as of this instant at confirm (absent on older actions). */
    proposedAt: z.string().optional(),
  })
  .strict();
export type BookCourtPlan = z.infer<typeof bookCourtPlanSchema>;

/** Server-only `post` payload of the client-executed plan (never sent to the app). */
export const bookCourtClientPostSchema = z
  .object({
    slotRef: z.string(),
    clubId: z.string(),
    courtIds: z.array(z.string()).min(1),
    start: z.string(),
    durationMinutes: z.number().int().positive(),
    provider: z.enum(CLIENT_PROVIDERS),
    gameId: z.string().nullable(),
    proposedAt: z.string(),
  })
  .strict();
export type BookCourtClientPost = z.infer<typeof bookCourtClientPostSchema>;

export type SlotCourt = { id: string; name: string; externalCourtId: string | null };

/** A verified slot with the club's current data. */
export type ResolvedSlot = {
  payload: SlotRefPayload;
  club: { id: string; name: string; provider: ClubIntegrationType | 'NONE'; timeZone: string };
  courts: SlotCourt[];
  start: Date;
  end: Date;
  /** Club-local calendar date / wall clock of the start and end. */
  date: string;
  startTime: string;
  endTime: string;
};

// --- guards --------------------------------------------------------------------------------

function slotRefError(error: unknown, locale: string | null | undefined): unknown {
  if (error instanceof ApiError && error.statusCode === 400) {
    if (error.message === 'agent.slotRefExpired') return new ApiError(400, agentBookingT(locale, 'error.slotExpired'));
    if (error.message === 'agent.slotRefInvalid') return new ApiError(400, agentBookingT(locale, 'error.slotInvalid'));
  }
  return error;
}

/**
 * `verifySlotRef` (the ref is user-typed text as far as the server knows) + the club's current
 * provider and courts. A slot that started already is expired.
 */
export async function resolveSlot(
  principal: AgentPrincipal,
  slotRef: string,
  now: Date,
  locale: string | null | undefined,
  /** Verify the ref's TTL as of this instant (the proposal time at confirm); default `now`. */
  refValidAt: Date = now,
): Promise<ResolvedSlot> {
  let payload: SlotRefPayload;
  try {
    payload = verifySlotRef(principal, slotRef, { now: refValidAt });
  } catch (error) {
    throw slotRefError(error, locale);
  }
  const club = await prisma.club.findUnique({
    where: { id: payload.clubId },
    select: {
      id: true,
      name: true,
      isActive: true,
      integrationType: true,
      city: { select: { timezone: true } },
      courts: {
        where: { id: { in: payload.courtIds }, isActive: true },
        select: { id: true, name: true, externalCourtId: true },
      },
    },
  });
  if (!club || !club.isActive) throw new ApiError(404, 'Club not found');
  const provider = club.integrationType ?? 'NONE';
  const courts = payload.courtIds.map((id) => club.courts.find((court) => court.id === id));
  if (provider !== payload.provider || courts.some((court) => !court)) {
    throw new ApiError(400, agentBookingT(locale, 'error.slotInvalid'));
  }
  const start = new Date(payload.start);
  if (start.getTime() <= now.getTime()) throw new ApiError(400, agentBookingT(locale, 'error.slotExpired'));
  const end = new Date(start.getTime() + payload.durationMinutes * 60_000);
  const timeZone = club.city?.timezone || 'UTC';
  return {
    payload,
    club: { id: club.id, name: club.name, provider, timeZone },
    courts: courts as SlotCourt[],
    start,
    end,
    date: formatInTimeZone(start, timeZone, 'yyyy-MM-dd'),
    startTime: formatInTimeZone(start, timeZone, 'HH:mm'),
    endTime: formatInTimeZone(end, timeZone, 'HH:mm'),
  };
}

export function isServerProvider(provider: ClubIntegrationType | 'NONE'): provider is ServerProvider {
  return (SERVER_PROVIDERS as readonly string[]).includes(provider);
}

export function isClientProvider(provider: ClubIntegrationType | 'NONE'): provider is ClientProvider {
  return (CLIENT_PROVIDERS as readonly string[]).includes(provider);
}

/**
 * Stored proposal time → the instant the slotRef is verified at on confirm / claim. Never later
 * than now; unparsable / absent (actions from before 7g) → now (the old strict check).
 */
export function refValidAt(proposedAt: string | undefined, now: Date): Date {
  const at = proposedAt ? new Date(proposedAt) : null;
  return at && Number.isFinite(at.getTime()) && at.getTime() < now.getTime() ? at : now;
}

/** Client providers: the user's stored provider login for the club (written by the app's sign-in). */
export async function clientConnected(userId: string, provider: ClientProvider, clubId: string): Promise<boolean> {
  const where = { userId_clubId: { userId, clubId } };
  const select = { id: true } as const;
  if (provider === ClubIntegrationType.BOOKTIME) return Boolean(await prisma.userClubBooktimeAuth.findUnique({ where, select }));
  if (provider === ClubIntegrationType.PADELOO) return Boolean(await prisma.userClubPadelooAuth.findUnique({ where, select }));
  return Boolean(await prisma.userClubKlikterenAuth.findUnique({ where, select }));
}

/** Visibility (404) → the HTTP booking rule (403) → the game is at the slot's club. */
async function authorizeGame(principal: AgentPrincipal, gameId: string, clubId: string) {
  await assertAgentCanViewGame(principal, gameId);
  if (!(await canMutateGameBookings(gameId, principal.userId, principal.isAdmin))) {
    throw new ApiError(403, 'Only the owner or an admin of this game can change its court bookings');
  }
  const game = await loadGameForWrite(gameId);
  if ((game.clubId ?? game.court?.clubId ?? null) !== clubId) {
    throw new ApiError(400, 'This slot is at a different club than the game; a game can only link bookings at its own club');
  }
  return game;
}

/** What the provider needs before the server can book for the user; null = ready. */
export async function connectionGap(userId: string, provider: ServerProvider, clubId: string): Promise<'weltner' | 'nspadel' | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, phone: true },
  });
  if (provider === ClubIntegrationType.WELTNER) {
    const auth = await prisma.userClubWeltnerAuth.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { id: true },
    });
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    return auth && name ? null : 'weltner';
  }
  // Same rule as `createNspadelBooking` (the app gates on the backend's answer).
  const name = `${user?.firstName?.trim() ?? ''} ${user?.lastName?.trim() ?? ''}`.trim();
  const phone = user?.phone?.trim() ?? '';
  return name.length >= 2 && phone.length >= 5 ? null : 'nspadel';
}

export function gapMessage(gap: 'weltner' | 'nspadel', locale: string | null | undefined): string {
  return agentBookingT(locale, gap === 'weltner' ? 'refuse.weltnerNotConnected' : 'refuse.nspadelProfile');
}

// --- refusals (a tool result, not an error, so the app can show the handoff) ---------------

export function handoff(url: string, label: string): AgentEntityRef {
  return { type: 'handoff', url, label };
}

export function refusal(reason: string, message: string, entity: AgentEntityRef): AgentToolResult {
  return {
    data: { error: 'not_available', reason, message, nothingBooked: true },
    summary: message,
    entities: [entity],
  };
}

// --- preview -------------------------------------------------------------------------------

function whenLabel(slot: ResolvedSlot, locale: string): string {
  const time = `${formatAgentDateTime(slot.start, slot.club.timeZone, locale)}–${slot.endTime}`;
  return agentBookingT(locale, 'value.clubTime', { time, zone: slot.club.timeZone });
}

/** Club, courts, club-local time + tz, duration, provider (shared with `create_game_with_booking`). */
export function slotBookingLines(slot: ResolvedSlot, provider: ServerProvider | ClientProvider, locale: string): AgentActionPreviewLine[] {
  return [
    line(agentT(locale, 'field.club'), null, slot.club.name),
    line(agentBookingT(locale, 'field.courts'), null, slot.courts.map((c) => c.name).join(', ')),
    line(agentT(locale, 'field.when'), null, whenLabel(slot, locale)),
    line(agentBookingT(locale, 'field.duration'), null, agentBookingT(locale, 'value.minutes', { minutes: slot.payload.durationMinutes })),
    line(agentBookingT(locale, 'field.provider'), null, PROVIDER_LABEL[provider]),
  ];
}

/** Nspadel / Weltner: cancel only via the club, no price, whose name / phone the club books under. */
export function serverBookingWarnings(provider: ServerProvider, locale: string): string[] {
  return [
    agentBookingT(locale, 'warn.cancelViaClub'),
    agentBookingT(locale, 'warn.noPrice'),
    agentBookingT(locale, provider === ClubIntegrationType.WELTNER ? 'warn.weltnerContact' : 'warn.nspadelContact'),
  ];
}

/** Client-executed: booked by the app (re-checks price; never "free"), cancellable in the app, rollback for 2+ courts. */
export function clientBookingWarnings(slot: ResolvedSlot, locale: string): string[] {
  const warnings = [agentBookingT(locale, 'warn.bookedInApp'), agentBookingT(locale, 'warn.cancelInApp')];
  if (slot.courts.length > 1) warnings.push(agentBookingT(locale, 'warn.rollback'));
  return warnings;
}

// --- execute helpers -----------------------------------------------------------------------

/** Planned app courts that are free right now (uncached provider call). */
async function liveFreeCourtIds(slot: ResolvedSlot, provider: ServerProvider): Promise<Set<string>> {
  const free = new Set<string>();
  if (provider === ClubIntegrationType.WELTNER) {
    const availability = await getWeltnerAvailability(slot.club.id, slot.date);
    for (const court of availability.courts) {
      if (court.slots.some((s) => s.start === slot.startTime && s.duration === slot.payload.durationMinutes)) {
        free.add(court.courtId);
      }
    }
    return free;
  }
  const { slots } = await getNspadelAvailability(slot.club.id, slot.date, slot.payload.durationMinutes);
  const startMin = parseTimeToMinutes(slot.startTime);
  if (startMin == null) return free;
  const endMin = startMin + slot.payload.durationMinutes;
  for (const court of slot.courts) {
    const ok = slots.some((range) => {
      const s = parseTimeToMinutes(range.startTime);
      const e = parseTimeToMinutes(range.endTime);
      return range.courtId === court.externalCourtId && s != null && e != null && s <= startMin && endMin <= e;
    });
    if (ok) free.add(court.id);
  }
  return free;
}

export type BookedCourt = { ref: string; externalBookingId: string; courtId: string; start: string; end: string };
export type CourtFailure = 'taken' | 'rejected' | 'unknown';

async function bookOneCourt(principal: AgentPrincipal, slot: ResolvedSlot, provider: ServerProvider, court: SlotCourt): Promise<BookedCourt> {
  if (provider === ClubIntegrationType.WELTNER) {
    const receipt = await createWeltnerBooking({
      userId: principal.userId,
      clubId: slot.club.id,
      courtId: court.id,
      date: slot.date,
      startTime: slot.startTime,
      durationMinutes: slot.payload.durationMinutes,
    });
    return {
      ref: receipt.externalBookingId,
      externalBookingId: receipt.externalBookingId,
      courtId: receipt.courtId,
      start: receipt.bookingStart,
      end: receipt.bookingEnd,
    };
  }
  const result = await createNspadelBooking({
    clubId: slot.club.id,
    userId: principal.userId,
    courtId: court.externalCourtId ?? '',
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
  });
  return {
    ref: `nspadel:${result.receiptId}`,
    externalBookingId: result.id,
    courtId: result.appCourtId ?? court.id,
    start: result.bookingStart,
    end: result.bookingEnd,
  };
}

async function classifyCourtFailure(
  error: unknown,
  principal: AgentPrincipal,
  slot: ResolvedSlot,
  provider: ServerProvider,
  court: SlotCourt,
): Promise<CourtFailure> {
  const message = error instanceof ApiError ? error.message : '';
  if (provider === ClubIntegrationType.WELTNER) {
    if (message === 'weltner.bookingUnknown') return 'unknown';
    if (message === BOOKING_ERROR_KEYS.slotNoLongerAvailable) return 'taken';
    return 'rejected';
  }
  // Nspadel: the receipt says whether the insert may have happened.
  const receipt = await prisma.nspadelBooking.findUnique({
    where: {
      idempotencyKey: nspadelIdempotencyKey({
        userId: principal.userId,
        clubId: slot.club.id,
        externalCourtId: court.externalCourtId ?? '',
        date: slot.date,
        startTime: slot.startTime,
        durationMinutes: slot.payload.durationMinutes,
      }),
    },
    select: { state: true },
  });
  if (receipt && (receipt.state === NspadelBookingState.UNKNOWN || receipt.state === NspadelBookingState.SUBMITTING)) {
    return 'unknown';
  }
  if (message === BOOKING_ERROR_KEYS.slotNoLongerAvailable) return 'taken';
  return 'rejected';
}

export type ServerBookingRun = { slotTaken: true } | { slotTaken: false; booked: BookedCourt[]; failure: CourtFailure | null };

/**
 * Nspadel / Weltner execution: uncached live re-check of every planned court (any taken → nothing
 * booked), then court by court until the first failure. Neither provider can roll back.
 */
export async function bookSlotOnServer(principal: AgentPrincipal, slot: ResolvedSlot, provider: ServerProvider): Promise<ServerBookingRun> {
  const free = await liveFreeCourtIds(slot, provider);
  if (slot.courts.some((court) => !free.has(court.id))) return { slotTaken: true };
  const booked: BookedCourt[] = [];
  let failure: CourtFailure | null = null;
  for (const court of slot.courts) {
    try {
      booked.push(await bookOneCourt(principal, slot, provider, court));
    } catch (error) {
      failure = await classifyCourtFailure(error, principal, slot, provider, court);
      if (!(error instanceof ApiError)) console.error('[agent] booking provider call failed', { provider, error });
      break;
    }
  }
  return { slotTaken: false, booked, failure };
}

/** Result text key when nothing was booked. */
export function nothingBookedKey(failure: CourtFailure | null): 'result.unknown' | 'result.slotTaken' | 'result.rejected' {
  return failure === 'unknown' ? 'result.unknown' : failure === 'taken' ? 'result.slotTaken' : 'result.rejected';
}

export function createGameHandoff(clubId: string, booked: BookedCourt[], locale: string): AgentEntityRef {
  const params = new URLSearchParams({
    clubId,
    locationTimeMode: 'bookings',
    bookingIds: booked.map((b) => b.externalBookingId).join(','),
    hasBookedCourt: '1',
    startTime: booked[0].start,
    endTime: booked[0].end,
    courtId: booked[0].courtId,
  });
  return handoff(`/create-game?${params.toString()}`, agentBookingT(locale, 'handoff.createGame'));
}

export async function bookingEntities(principal: AgentPrincipal, booked: BookedCourt[], now: Date): Promise<AgentEntityRef[]> {
  const out: AgentEntityRef[] = [];
  for (const b of booked) {
    const item = await resolveBookingRef(principal, b.ref, {}, now).catch(() => null);
    if (item) out.push(agentBookingEntity(item));
  }
  return out;
}

/** Plan ↔ fresh slot: the stored plan must still describe exactly the signed slot. */
function assertPlanMatches(
  plan: Pick<BookCourtPlan, 'clubId' | 'start' | 'durationMinutes' | 'provider' | 'courtIds'> | BookCourtClientPost,
  slot: ResolvedSlot,
): void {
  const p = slot.payload;
  if (
    p.clubId !== plan.clubId ||
    p.start !== plan.start ||
    p.durationMinutes !== plan.durationMinutes ||
    p.provider !== plan.provider ||
    p.courtIds.join(',') !== plan.courtIds.join(',')
  ) {
    throw new ApiError(400, 'stored booking plan does not match its slot');
  }
}

export async function authorizePlan(principal: AgentPrincipal, plan: BookCourtPlan, now: Date, locale: string | null | undefined) {
  const slot = await resolveSlot(principal, plan.slotRef, now, locale, refValidAt(plan.proposedAt, now));
  assertPlanMatches(plan, slot);
  if (plan.gameId) await authorizeGame(principal, plan.gameId, slot.club.id);
  const gap = await connectionGap(principal.userId, plan.provider, slot.club.id);
  if (gap) throw new ApiError(400, gapMessage(gap, locale));
  return slot;
}

// --- client-executed (Booktime / Padeloo / Klikteren, slice 7g) ------------------------------

/** Claim-time guard of a client-executed plan: the same checks as propose, fresh principal. */
async function authorizeClientPlan(principal: AgentPrincipal, rawPlan: unknown, now: Date, locale: string | null | undefined) {
  const stored = readClientExecutedPlan(rawPlan);
  if (!stored) throw new Error('stored agent action plan is invalid');
  await authorizeClientBooking(principal, stored.clientPlan, parsePlan(bookCourtClientPostSchema, stored.post), now, locale);
}

/**
 * Client-executed booking guard (claim time): slotRef as of the proposal, the app plan still equals
 * the signed slot, game guards (with `gameId`), the user's provider login for the club.
 */
export async function authorizeClientBooking(
  principal: AgentPrincipal,
  cp: AgentClientPlan,
  post: BookCourtClientPost,
  now: Date,
  locale: string | null | undefined,
): Promise<ResolvedSlot> {
  const slot = await resolveSlot(principal, post.slotRef, now, locale, refValidAt(post.proposedAt, now));
  assertPlanMatches(post, slot);
  if (
    cp.operation !== 'book' ||
    cp.provider !== post.provider ||
    cp.clubId !== post.clubId ||
    cp.date !== slot.date ||
    cp.start !== slot.startTime ||
    cp.durationMinutes !== post.durationMinutes ||
    cp.courts.map((c) => c.courtId).join(',') !== post.courtIds.join(',')
  ) {
    throw new ApiError(400, 'stored booking plan does not match its slot');
  }
  if (post.gameId) await authorizeGame(principal, post.gameId, slot.club.id);
  if (!(await clientConnected(principal.userId, post.provider, slot.club.id))) {
    throw new ApiError(400, agentBookingT(locale, 'refuse.clientNotConnected'));
  }
  return slot;
}

/**
 * After the app reports (results already checked against the plan by `validateAgentClientReport`):
 * mirror rows for the new bookings, then link to the game (times from the plan, ids and courts
 * from the report; booker = the user) or a create-game handoff.
 */
/**
 * The courts the app reported booked (only planned ones; ids and courts from the report, times
 * from the plan) → the user's CONFIRMED mirror rows (so `list_my_bookings` sees them at once);
 * `ref` is the `mirror:` bookingRef ('' when the upsert failed).
 */
export async function recordClientBookings(
  ctx: Pick<AgentWriteContext, 'principal' | 'now'>,
  post: BookCourtClientPost,
  succeeded: AgentClientPostStepInput['succeeded'],
): Promise<BookedCourt[]> {
  const { principal, now } = ctx;
  const start = new Date(post.start);
  const end = new Date(start.getTime() + post.durationMinutes * 60_000);
  const courts = await prisma.court.findMany({ where: { id: { in: post.courtIds } }, select: { id: true, name: true } });
  const booked: BookedCourt[] = [];
  for (const r of succeeded) {
    if (!r.externalBookingId || !r.courtId || !post.courtIds.includes(r.courtId)) continue;
    booked.push({ ref: '', externalBookingId: r.externalBookingId, courtId: r.courtId, start: start.toISOString(), end: end.toISOString() });
  }

  try {
    const mirrorIds = await upsertAgentBookedMirrorRows(
      principal.userId,
      post.provider,
      post.clubId,
      booked.map((b) => ({
        externalBookingId: b.externalBookingId,
        start,
        end,
        courts: [{ courtId: b.courtId, name: courts.find((c) => c.id === b.courtId)?.name ?? null }],
      })),
      now,
    );
    booked.forEach((b, i) => {
      b.ref = mirrorIds[i] ? `mirror:${mirrorIds[i]}` : '';
    });
  } catch (error) {
    console.error('[agent] booking: mirror upsert failed', { error });
  }
  return booked;
}

async function bookCourtClientPostStep(ctx: AgentWriteContext, input: AgentClientPostStepInput): Promise<AgentWriteOutcome> {
  const post = parsePlan(bookCourtClientPostSchema, input.post);
  const { principal, locale, now } = ctx;
  const start = new Date(post.start);
  const end = new Date(start.getTime() + post.durationMinutes * 60_000);
  const booked = await recordClientBookings(ctx, post, input.succeeded);
  const total = input.planned;
  const base = { planned: total, clubId: post.clubId, start: start.toISOString(), end: end.toISOString() };

  let linked = false;
  let linkFailed = false;
  if (post.gameId && booked.length) {
    try {
      await authorizeGame(principal, post.gameId, post.clubId);
      for (const b of booked) {
        await linkBookingToGame(post.gameId, principal.userId, principal.isAdmin, {
          externalBookingId: b.externalBookingId,
          snapshot: { externalBookingId: b.externalBookingId, courtId: b.courtId, bookingStart: b.start, bookingEnd: b.end },
        });
      }
      linked = true;
    } catch (error) {
      linkFailed = true;
      console.error('[agent] book_court: booked in the app but linking failed', { gameId: post.gameId, error });
    }
  }

  const parts: string[] = [];
  if (booked.length < total) parts.push(agentBookingT(locale, 'result.partial', { booked: booked.length, total }));
  else parts.push(agentBookingT(locale, linked ? 'result.bookedLinked' : 'result.booked', { count: booked.length }));
  if (linkFailed) parts.push(agentBookingT(locale, 'result.linkFailed'));

  const entities: AgentEntityRef[] = await bookingEntities(principal, booked.filter((b) => b.ref), now);
  if (post.gameId) {
    entities.push(...(await gameEntityFor(post.gameId, principal.userId)));
    if (linkFailed) entities.push(handoff(`/games/${post.gameId}`, agentBookingT(locale, 'handoff.openGame')));
  } else if (booked.length) {
    entities.push(createGameHandoff(post.clubId, booked, locale));
  }
  const partial = booked.length < total || linkFailed;
  return {
    message: parts.join(' '),
    entities,
    ...(partial ? { partial: true } : {}),
    modelData: {
      ...base,
      booked: booked.length,
      bookingRefs: booked.map((b) => b.ref).filter(Boolean),
      ...(post.gameId ? { gameId: post.gameId, linkedToGame: linked } : {}),
      cancel: 'in the app (cancel_booking), within the club rules',
    },
  };
}

registerAgentClientPostStep('book_court', bookCourtClientPostStep);

/** Client providers at propose time: not connected / an unmapped court → a refusal with a handoff; null = ok. */
export async function clientBookingRefusal(
  principal: AgentPrincipal,
  slot: ResolvedSlot,
  locale: string,
  clubHandoff: AgentEntityRef,
): Promise<AgentToolResult | null> {
  if (!(await clientConnected(principal.userId, slot.club.provider as ClientProvider, slot.club.id))) {
    return refusal(
      'not_connected',
      agentBookingT(locale, 'refuse.clientNotConnected'),
      handoff('/profile/connected-clubs', agentBookingT(locale, 'handoff.connectedClubs')),
    );
  }
  // The app books by provider court id; a court the club never mapped can't be booked here.
  if (slot.courts.some((court) => !court.externalCourtId)) {
    return refusal('book_in_app', agentBookingT(locale, 'refuse.clientProvider'), clubHandoff);
  }
  return null;
}

/** What the app runs on Confirm; `rollbackOnPartial` since all three client providers can cancel (§14.6). */
export function clientBookingPlan(slot: ResolvedSlot, postStep: AgentClientPlan['postStep']): AgentClientPlan {
  return {
    provider: slot.club.provider as ClientProvider,
    clubId: slot.club.id,
    courts: slot.courts.map((court) => ({ courtId: court.id, externalCourtId: court.externalCourtId })),
    date: slot.date,
    start: slot.startTime,
    durationMinutes: slot.payload.durationMinutes,
    operation: 'book',
    bookings: [],
    postStep,
    rollbackOnPartial: true,
  };
}

/** The server-only booking half of a client-executed plan (`post`). */
export function clientBookingPost(
  ctx: Pick<AgentToolContext, 'now'>,
  slotRef: string,
  slot: ResolvedSlot,
  gameId: string | null,
): BookCourtClientPost {
  return {
    slotRef,
    clubId: slot.club.id,
    courtIds: slot.payload.courtIds,
    start: slot.payload.start,
    durationMinutes: slot.payload.durationMinutes,
    provider: slot.club.provider as ClientProvider,
    gameId,
    proposedAt: ctx.now.toISOString(),
  };
}

/** Nspadel / Weltner at propose time: not connected → a refusal with a handoff; null = ready. */
export async function serverBookingRefusal(principal: AgentPrincipal, provider: ServerProvider, clubId: string, locale: string): Promise<AgentToolResult | null> {
  const gap = await connectionGap(principal.userId, provider, clubId);
  if (!gap) return null;
  const url = gap === 'weltner' ? '/profile/connected-clubs' : '/profile';
  const label = agentBookingT(locale, gap === 'weltner' ? 'handoff.connectedClubs' : 'handoff.profile');
  return refusal(gap === 'weltner' ? 'not_connected' : 'profile_contact_required', gapMessage(gap, locale), handoff(url, label));
}

/**
 * Propose-time client branch: guards (game, connected) → preview → a client-executed action.
 * Proposed even without the `booking-v1` cap: Telegram renders it with "Open in app".
 */
async function proposeClientBooking(
  ctx: AgentToolContext,
  args: z.infer<typeof bookCourtInput>,
  slot: ResolvedSlot,
  clubHandoff: AgentEntityRef,
): Promise<AgentToolResult> {
  const { principal, locale } = ctx;
  const provider = slot.club.provider as ClientProvider;
  const game = args.gameId ? await authorizeGame(principal, args.gameId, slot.club.id) : null;
  const refused = await clientBookingRefusal(principal, slot, locale, clubHandoff);
  if (refused) return refused;

  const lines = slotBookingLines(slot, provider, locale);
  if (game) {
    const title = agentGameTitle(game);
    lines.push(line(agentBookingT(locale, 'field.game'), null, clip(title, 60) ?? title));
  }
  // Snapshot confidence: never "free"; the app re-checks live and quotes the price.
  const warnings = clientBookingWarnings(slot, locale);
  if (game) warnings.push(agentBookingT(locale, 'warn.linksToGame'));
  const preview: AgentActionPreview = {
    title: agentBookingT(locale, 'preview.book.title', { club: clip(slot.club.name, 60) ?? slot.club.name }),
    lines,
    warnings,
  };
  const clientPlan = clientBookingPlan(slot, { kind: game ? 'link_game' : 'none', gameId: game?.id ?? null });
  const post = clientBookingPost(ctx, args.slotRef, slot, game?.id ?? null);
  const result = await proposeClientExecutedAction(ctx, { toolName: 'book_court', input: args, clientPlan, post, preview });
  return { ...result, entities: game ? await gameEntityFor(game.id, principal.userId) : [] };
}

// --- tool ----------------------------------------------------------------------------------

export const bookCourtTool = defineTool({
  name: 'book_court',
  description:
    'Prepare booking the court(s) of one slot from find_available_slots (pass its slotRef unchanged; a user message ending in a [slot:<ref>] token means that ref). Optionally link the booking to a game the user organises at the same club (gameId). If the user wants to play at the slot and has no game yet, use create_game_with_booking instead. Creates a confirmation card; nothing is booked until the user confirms. Some clubs are booked by the user\'s app on confirm (the card says so; on Telegram the user opens the app). NS Padel / Weltner bookings can only be cancelled via the club.',
  kind: 'write',
  riskTier: 'critical',
  scope: 'user',
  promptHint:
    'book a court slot from find_available_slots (slotRef, or the [slot:…] token in the user message), optionally linked to a game they organise',
  input: bookCourtInput,
  label: (_args, locale) => agentBookingT(locale, 'label.bookCourt'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    const slot = await resolveSlot(principal, args.slotRef, ctx.now, locale);
    const provider = slot.club.provider;
    const clubHandoff = handoff(`/clubs/${slot.club.id}`, agentBookingT(locale, 'handoff.openClub'));
    if (isClientProvider(provider)) return proposeClientBooking(ctx, args, slot, clubHandoff);
    if (!isServerProvider(provider)) {
      return refusal('no_online_booking', agentBookingT(locale, 'refuse.noIntegration'), clubHandoff);
    }
    const game = args.gameId ? await authorizeGame(principal, args.gameId, slot.club.id) : null;
    const refused = await serverBookingRefusal(principal, provider, slot.club.id, locale);
    if (refused) return refused;

    const lines = slotBookingLines(slot, provider, locale);
    if (game) {
      const title = agentGameTitle(game);
      lines.push(line(agentBookingT(locale, 'field.game'), null, clip(title, 60) ?? title));
    }
    const warnings = serverBookingWarnings(provider, locale);
    if (game) warnings.push(agentBookingT(locale, 'warn.linksToGame'));
    const preview: AgentActionPreview = {
      title: agentBookingT(locale, 'preview.book.title', { club: clip(slot.club.name, 60) ?? slot.club.name }),
      lines,
      warnings,
    };
    const plan: BookCourtPlan = {
      slotRef: args.slotRef,
      clubId: slot.club.id,
      courtIds: slot.payload.courtIds,
      start: slot.payload.start,
      durationMinutes: slot.payload.durationMinutes,
      provider,
      gameId: game?.id ?? null,
      proposedAt: ctx.now.toISOString(),
    };
    const result = await proposeAgentAction(ctx, { toolName: 'book_court', input: args, plan, preview });
    return { ...result, entities: game ? await gameEntityFor(game.id, principal.userId) : [] };
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      if (isClientExecutedPlan(rawPlan)) {
        await authorizeClientPlan(principal, rawPlan, new Date(), principal.language);
        return;
      }
      await authorizePlan(principal, parsePlan(bookCourtPlanSchema, rawPlan), new Date(), principal.language);
    },
    execute: async (ctx, rawPlan): Promise<AgentWriteOutcome> => {
      // Client-executed plans never run here (`/confirm` → 409 CLIENT_EXECUTION_REQUIRED).
      if (isClientExecutedPlan(rawPlan)) throw new Error('book_court: client-executed plan reached execute');
      const plan = parsePlan(bookCourtPlanSchema, rawPlan);
      const { principal, locale, now } = ctx;
      const slot = await authorizePlan(principal, plan, now, locale);
      const provider = plan.provider;
      const total = slot.courts.length;
      const base = { planned: total, clubId: slot.club.id, start: slot.start.toISOString(), end: slot.end.toISOString() };

      // Live re-check of every court before the first write: a known-taken court books nothing.
      const run = await bookSlotOnServer(principal, slot, provider);
      if (run.slotTaken) {
        return {
          message: agentBookingT(locale, 'result.slotTaken'),
          failed: { changed: false },
          modelData: { ...base, booked: 0, reason: 'slot_taken' },
        };
      }
      const { booked, failure } = run;

      if (booked.length === 0) {
        return {
          message: agentBookingT(locale, nothingBookedKey(failure)),
          failed: { changed: failure === 'unknown' },
          modelData: { ...base, booked: 0, reason: failure ?? 'rejected' },
        };
      }

      let linked = false;
      let linkFailed = false;
      if (plan.gameId) {
        try {
          for (const b of booked) {
            await linkBookingToGame(plan.gameId, principal.userId, principal.isAdmin, {
              externalBookingId: b.externalBookingId,
              snapshot: { externalBookingId: b.externalBookingId, courtId: b.courtId, bookingStart: b.start, bookingEnd: b.end },
            });
          }
          linked = true;
        } catch (error) {
          linkFailed = true;
          console.error('[agent] book_court: booked but linking failed', { gameId: plan.gameId, error });
        }
      }

      const parts: string[] = [];
      if (booked.length < total) parts.push(agentBookingT(locale, 'result.partial', { booked: booked.length, total }));
      else parts.push(agentBookingT(locale, linked ? 'result.bookedLinked' : 'result.booked', { count: booked.length }));
      if (linkFailed) parts.push(agentBookingT(locale, 'result.linkFailed'));
      if (failure === 'unknown') parts.push(agentBookingT(locale, 'result.unknown'));

      const entities: AgentEntityRef[] = await bookingEntities(principal, booked, now);
      if (plan.gameId) {
        entities.push(...(await gameEntityFor(plan.gameId, principal.userId)));
        if (linkFailed) entities.push(handoff(`/games/${plan.gameId}`, agentBookingT(locale, 'handoff.openGame')));
      } else {
        entities.push(createGameHandoff(slot.club.id, booked, locale));
      }
      const partial = booked.length < total || linkFailed || failure === 'unknown';
      return {
        message: parts.join(' '),
        entities,
        ...(partial ? { partial: true } : {}),
        modelData: {
          ...base,
          booked: booked.length,
          bookingRefs: booked.map((b) => b.ref),
          ...(plan.gameId ? { gameId: plan.gameId, linkedToGame: linked } : {}),
          ...(failure ? { notBookedReason: failure } : {}),
          cancel: 'only via the club',
        },
      };
    },
  },
});

export const BOOK_COURT_TOOLS = [bookCourtTool];
