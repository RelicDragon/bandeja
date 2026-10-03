/**
 * `create_game_with_booking` (booking plan §14.6, slice 7d2): the `create_game` fields, with a
 * `slotRef` (from `find_available_slots` or a `[slot:…]` token) instead of club / court / time.
 * Books the slot's court(s) AND creates the game on them. Critical: always a confirmation card.
 *
 * Reuses `create_game` (field schema, who-may-create guard, body at the create page's defaults,
 * preview lines, `GameCreateService.createGame`) and `book_court` (slotRef verification incl. the
 * proposal-time TTL at confirm / claim, connected checks, provider routing, live re-check, the
 * server booking loop, the client plan, mirror rows).
 *
 * Server (Nspadel / Weltner): confirm → live re-check → book court by court → `createGame` with
 * `externalBookingIds` / `bookingSnapshots` (ids, courts and times from the provider response;
 * booker = the user). Nothing booked → FAILED "no game created". Neither provider can cancel, so
 * a game creation failure after booking is EXECUTED `partial` "Booked; game not created" + a
 * `/create-game?…bookingIds=` handoff; a partial multi-court booking creates the game on the
 * courts that were booked (`partial`, "2 of 3 courts").
 *
 * Client (Booktime / Padeloo / Klikteren): a client-executed plan (`rollbackOnPartial`, post-step
 * `create_game`). The post-step records the reported bookings (mirror rows), re-checks the create
 * guard and creates the game with them. A creation failure there is `partial` "Booked; game not
 * created" + the handoff; the server never tries to cancel.
 */
import type { AgentActionPreview, AgentEntityRef } from '@bandeja/shared/agentContract';
import { z } from 'zod/v4';
import prisma from '../../../config/database';
import type { CreateTemplate } from '../../../shared/createTemplates';
import { ApiError } from '../../../utils/ApiError';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { proposeAgentAction } from '../agentActionPropose';
import { isClientExecutedPlan, proposeClientExecutedAction, readClientExecutedPlan } from '../clientExecution/clientPlan';
import { registerAgentClientPostStep, type AgentClientPostStepInput } from '../clientExecution/clientPostSteps';
import { agentBookingT } from '../i18n/agentBookingI18n';
import {
  authorizeClientBooking,
  authorizePlan,
  bookCourtClientPostSchema,
  bookCourtPlanSchema,
  bookingEntities,
  bookSlotOnServer,
  clientBookingPlan,
  clientBookingPost,
  clientBookingRefusal,
  clientBookingWarnings,
  createGameHandoff,
  handoff,
  isClientProvider,
  isServerProvider,
  nothingBookedKey,
  recordClientBookings,
  refusal,
  resolveSlot,
  serverBookingRefusal,
  serverBookingWarnings,
  slotBookingLines,
  SLOT_REF,
  type BookCourtPlan,
  type BookedCourt,
  type ResolvedSlot,
} from './bookCourt.tools';
import {
  assertMayCreate,
  buildCreateGameDraft,
  checkCreateGameFields,
  createGameFieldsShape,
  createGameFromPlan,
  createPlanSchema,
} from './createGame.tools';
import { defineTool, type AgentToolContext, type AgentToolResult, type AgentWriteContext, type AgentWriteOutcome } from './registry';
import { clip, parsePlan } from './writeHelpers';

const TOOL_NAME = 'create_game_with_booking';

const createGameWithBookingInput = z
  .object({
    slotRef: SLOT_REF,
    ...createGameFieldsShape,
  })
  .strict();
type CreateGameWithBookingArgs = z.infer<typeof createGameWithBookingInput>;

/** Server plan: `book_court`'s plan (never with a game) + `create_game`'s. */
const serverPlanSchema = z
  .object({
    booking: bookCourtPlanSchema.refine((b) => b.gameId === null),
    create: createPlanSchema,
  })
  .strict();

/** Client plan's server-only `post`: `book_court`'s post (never with a game) + `create_game`'s plan. */
const clientPostSchema = z
  .object({
    booking: bookCourtClientPostSchema.refine((b) => b.gameId === null),
    create: createPlanSchema,
  })
  .strict();

/** The `POST /games` booking fields the create page sends in "bookings" mode (`CreateGame.tsx`). */
function bookingCreateFields(provider: string, booked: BookedCourt[]): Record<string, unknown> {
  return {
    courtId: booked[0].courtId,
    ...(booked.length > 1 ? { courtIds: booked.map((b) => b.courtId) } : {}),
    startTime: booked[0].start,
    endTime: booked[0].end,
    timeOverride: false,
    hasBookedCourt: true,
    externalBookingIds: booked.map((b) => b.externalBookingId),
    externalBookingProvider: provider,
    bookingSnapshots: booked.map((b) => ({
      externalBookingId: b.externalBookingId,
      courtId: b.courtId,
      bookingStart: b.start,
      bookingEnd: b.end,
    })),
  };
}

/**
 * The bookings exist; now the game. Creation failure → EXECUTED `partial` "Booked; game not
 * created" + create-game handoff (the bookings are never cancelled from here).
 */
async function createGameOnBookings(
  ctx: Pick<AgentWriteContext, 'principal' | 'locale' | 'now'>,
  params: {
    create: z.infer<typeof createPlanSchema>;
    provider: string;
    clubId: string;
    booked: BookedCourt[];
    planned: number;
    notes?: string[];
    cancel: string;
  },
): Promise<AgentWriteOutcome> {
  const { principal, locale, now } = ctx;
  const { booked, planned } = params;
  const bookingModel = {
    planned,
    booked: booked.length,
    clubId: params.clubId,
    start: booked[0]?.start ?? null,
    end: booked[0]?.end ?? null,
    bookingRefs: booked.map((b) => b.ref).filter(Boolean),
    cancel: params.cancel,
  };
  const partialCourts = booked.length < planned;
  const head = partialCourts ? [agentBookingT(locale, 'result.partial', { booked: booked.length, total: planned })] : [];
  const bookingRefs = await bookingEntities(principal, booked.filter((b) => b.ref), now);

  let created: Awaited<ReturnType<typeof createGameFromPlan>>;
  try {
    if (!booked.length) throw new Error('no booked courts to create the game on');
    // Fresh principal: who may create what is re-checked right before the write.
    assertMayCreate(principal, params.create.entityType);
    created = await createGameFromPlan(principal, params.create, bookingCreateFields(params.provider, booked));
  } catch (error) {
    console.error(`[agent] ${TOOL_NAME}: booked but creating the game failed`, { error });
    const entities: AgentEntityRef[] = [...bookingRefs];
    if (booked.length) entities.push(createGameHandoff(params.clubId, booked, locale));
    return {
      message: [...head, agentBookingT(locale, 'result.gameNotCreated'), ...(params.notes ?? [])].join(' '),
      entities,
      partial: true,
      modelData: { ...bookingModel, gameCreated: false },
    };
  }

  const message = partialCourts
    ? [...head, agentBookingT(locale, 'result.gameCreatedWithBooked')]
    : [agentBookingT(locale, 'result.createdWithBooking', { count: booked.length })];
  const partial = partialCourts || Boolean(params.notes?.length);
  return {
    message: [...message, ...(params.notes ?? [])].join(' '),
    entities: [...created.entities, ...bookingRefs],
    ...(partial ? { partial: true } : {}),
    modelData: { ...created.modelData, ...bookingModel, gameCreated: true },
  };
}

// --- client post-step ------------------------------------------------------------------------

/**
 * After the app reported (already checked against `clientPlan` by `validateAgentClientReport`):
 * the plan still equals the server `post` and every booked court matches the planned slot (else
 * throw), then mirror rows → the game on the booked courts.
 */
async function createGameWithBookingPostStep(ctx: AgentWriteContext, input: AgentClientPostStepInput): Promise<AgentWriteOutcome> {
  const post = parsePlan(clientPostSchema, input.post);
  const booking = post.booking;
  const cp = input.clientPlan;
  if (
    cp.operation !== 'book' ||
    cp.provider !== booking.provider ||
    cp.clubId !== booking.clubId ||
    cp.durationMinutes !== booking.durationMinutes ||
    cp.courts.map((c) => c.courtId).join(',') !== booking.courtIds.join(',')
  ) {
    throw new Error(`${TOOL_NAME}: client plan does not match its server payload`);
  }
  const matching = input.succeeded.filter(
    (r) =>
      r.provider === booking.provider &&
      r.date === cp.date &&
      r.start === cp.start &&
      r.durationMinutes === booking.durationMinutes &&
      Boolean(r.courtId && booking.courtIds.includes(r.courtId)),
  );
  // `validateAgentClientReport` already enforces this; a mismatch here means the report can't be
  // trusted, so throw (→ EXECUTED partial "Done at the club, but the follow-up step failed").
  if (!matching.length || matching.length !== input.succeeded.length) {
    throw new Error(`${TOOL_NAME}: reported bookings do not match the planned slot`);
  }
  const booked = await recordClientBookings(ctx, booking, matching);
  return createGameOnBookings(ctx, {
    create: post.create,
    provider: booking.provider,
    clubId: booking.clubId,
    booked,
    planned: input.planned,
    cancel: 'in the app (cancel_booking), within the club rules',
  });
}

registerAgentClientPostStep(TOOL_NAME, createGameWithBookingPostStep);

// --- propose ---------------------------------------------------------------------------------

async function playableClub(clubId: string): Promise<{ id: string; cityId: string }> {
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true, cityId: true, isForPlaying: true } });
  if (!club) throw new ApiError(404, 'Club not found');
  if (!club.isForPlaying) throw new ApiError(400, 'This club is not available for playing games');
  return club;
}

async function proposeCreateWithBooking(
  ctx: AgentToolContext,
  args: CreateGameWithBookingArgs,
  template: CreateTemplate | null,
  slot: ResolvedSlot,
): Promise<AgentToolResult> {
  const { principal, locale } = ctx;
  const { slotRef, ...fields } = args;
  const provider = slot.club.provider;
  const clubHandoff = handoff(`/clubs/${slot.club.id}`, agentBookingT(locale, 'handoff.openClub'));
  const client = isClientProvider(provider);
  if (!client && !isServerProvider(provider)) {
    const refused = refusal('no_online_booking', agentBookingT(locale, 'refuse.noIntegration'), clubHandoff);
    // Model-facing: the game itself can still be created (court booked with the club directly).
    return {
      ...refused,
      data: {
        ...(refused.data as Record<string, unknown>),
        nextStep: `To still create the game at this slot without booking the court, call create_game with clubId "${slot.club.id}", startTime "${slot.date}T${slot.startTime}" and the same game fields; when the user already asked for the game, propose it now and tell them to book the court with the club.`,
      },
    };
  }
  const refused = client
    ? await clientBookingRefusal(principal, slot, locale, clubHandoff)
    : await serverBookingRefusal(principal, provider, slot.club.id, locale);
  if (refused) return refused;
  const club = await playableClub(slot.club.id);

  const draft = await buildCreateGameDraft(ctx, fields, template, {
    club: { id: club.id, name: slot.club.name, cityId: club.cityId },
    court: { id: slot.courts[0].id, name: slot.courts[0].name },
    start: slot.start,
    end: slot.end,
    timezone: slot.club.timeZone,
  });
  const preview: AgentActionPreview = {
    title: agentBookingT(locale, 'preview.createWithBooking.title', { club: clip(slot.club.name, 60) ?? slot.club.name }),
    // create_game's type / sport / format, book_court's club / courts / time / duration / provider, then the settings.
    lines: [...draft.headLines, ...slotBookingLines(slot, provider, locale), ...draft.settingLines],
    warnings: [
      agentBookingT(locale, 'warn.booksAndCreates'),
      ...(client ? clientBookingWarnings(slot, locale) : serverBookingWarnings(provider, locale)),
      ...draft.warnings,
    ],
  };

  if (client) {
    const clientPlan = clientBookingPlan(slot, { kind: 'create_game', gameId: null });
    const post: z.infer<typeof clientPostSchema> = { booking: clientBookingPost(ctx, slotRef, slot, null), create: draft.plan };
    return proposeClientExecutedAction(ctx, { toolName: TOOL_NAME, input: args, clientPlan, post, preview });
  }
  const booking: BookCourtPlan = {
    slotRef,
    clubId: slot.club.id,
    courtIds: slot.payload.courtIds,
    start: slot.payload.start,
    durationMinutes: slot.payload.durationMinutes,
    provider,
    gameId: null,
    proposedAt: ctx.now.toISOString(),
  };
  const plan: z.infer<typeof serverPlanSchema> = { booking, create: draft.plan };
  return proposeAgentAction(ctx, { toolName: TOOL_NAME, input: args, plan, preview });
}

async function authorizeClient(principal: AgentPrincipal, rawPlan: unknown): Promise<void> {
  const stored = readClientExecutedPlan(rawPlan);
  if (!stored) throw new Error('stored agent action plan is invalid');
  const post = parsePlan(clientPostSchema, stored.post);
  assertMayCreate(principal, post.create.entityType);
  if (stored.clientPlan.postStep.kind !== 'create_game' || stored.clientPlan.postStep.gameId !== null) {
    throw new Error('stored agent action plan is invalid');
  }
  await authorizeClientBooking(principal, stored.clientPlan, post.booking, new Date(), principal.language);
}

// --- tool ------------------------------------------------------------------------------------

export const createGameWithBookingTool = defineTool({
  name: TOOL_NAME,
  description:
    'Prepare booking the court(s) of one slot from find_available_slots AND creating a casual game (GAME / TOURNAMENT with a format template) or a TRAINING on it, in one step. Pass the slotRef unchanged (a user message ending in a [slot:<ref>] token means that ref) plus the create_game fields; club, court and time come from the slot. Use this when the user wants to play at a found slot and has no game yet; if the game already exists, use book_court with gameId. Creates a confirmation card; nothing is booked or created until the user confirms. Some clubs are booked by the user\'s app on confirm (the card says so).',
  kind: 'write',
  riskTier: 'critical',
  scope: 'user',
  promptHint:
    'book a slot from find_available_slots and create the game on it in one step (when the user has no game yet; format templates only, never leagues, playoffs or events)',
  input: createGameWithBookingInput,
  label: (_args, locale) => agentBookingT(locale, 'label.createGameWithBooking'),
  handler: async (ctx, args) => {
    // Create guard first: nothing about the slot is looked at for a game the user may not create.
    const template = checkCreateGameFields(ctx.principal, args);
    const slot = await resolveSlot(ctx.principal, args.slotRef, ctx.now, ctx.locale);
    return proposeCreateWithBooking(ctx, args, template, slot);
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      if (isClientExecutedPlan(rawPlan)) {
        await authorizeClient(principal, rawPlan);
        return;
      }
      const plan = parsePlan(serverPlanSchema, rawPlan);
      assertMayCreate(principal, plan.create.entityType);
      await authorizePlan(principal, plan.booking, new Date(), principal.language);
    },
    execute: async (ctx, rawPlan): Promise<AgentWriteOutcome> => {
      // Client-executed plans never run here (`/confirm` → 409 CLIENT_EXECUTION_REQUIRED).
      if (isClientExecutedPlan(rawPlan)) throw new Error(`${TOOL_NAME}: client-executed plan reached execute`);
      const plan = parsePlan(serverPlanSchema, rawPlan);
      const { principal, locale, now } = ctx;
      assertMayCreate(principal, plan.create.entityType);
      const slot = await authorizePlan(principal, plan.booking, now, locale);
      const provider = plan.booking.provider;
      const planned = slot.courts.length;
      const base = { planned, clubId: slot.club.id, start: slot.start.toISOString(), end: slot.end.toISOString(), gameCreated: false };
      const noGame = agentBookingT(locale, 'result.noGameCreated');

      const run = await bookSlotOnServer(principal, slot, provider);
      if (run.slotTaken) {
        return {
          message: `${agentBookingT(locale, 'result.slotTaken')} ${noGame}`,
          failed: { changed: false },
          modelData: { ...base, booked: 0, reason: 'slot_taken' },
        };
      }
      const { booked, failure } = run;
      if (booked.length === 0) {
        return {
          message: `${agentBookingT(locale, nothingBookedKey(failure))} ${noGame}`,
          failed: { changed: failure === 'unknown' },
          modelData: { ...base, booked: 0, reason: failure ?? 'rejected' },
        };
      }
      return createGameOnBookings(ctx, {
        create: plan.create,
        provider,
        clubId: slot.club.id,
        booked,
        planned,
        notes: failure === 'unknown' ? [agentBookingT(locale, 'result.unknown')] : [],
        cancel: 'only via the club',
      });
    },
  },
});

export const CREATE_GAME_WITH_BOOKING_TOOLS = [createGameWithBookingTool];
