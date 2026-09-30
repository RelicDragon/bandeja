/**
 * Slice 7d2 `create_game_with_booking` (real dev DB, no LLM; provider HTTP faked in-process for
 * Nspadel / Weltner, any other outbound call fails the test; Booktime is client-executed, so the
 * backend never calls it).
 *   - Nspadel happy path: critical card with the create_game lines + booking lines, one reservation,
 *     the game on the booked court (link, booker, times from the provider response);
 *   - Weltner 2 courts: one game on both courts;
 *   - create guard: TRAINING by a non-trainer refused at propose (nothing proposed); flag lost
 *     before confirm → FAILED, nothing booked, no game;
 *   - booking fails (slot taken at the live re-check / the insert conflicts) → FAILED "no game created";
 *   - game creation fails after booking → EXECUTED partial "Booked; game not created" + handoff;
 *   - partial multi-court (2 of 3) → the game on the 2 booked courts, partial;
 *   - client path (Booktime): plan (post-step create_game, rollbackOnPartial), /confirm → 409,
 *     claim → report → game with the reported bookings + mirror rows; create failure in the
 *     post-step → partial + handoff; post-step validation (plan ≠ post / off-plan results throw);
 *     create guard at claim;
 *   - strict input (no club / court / time), slotRef from another user refused.
 * Don't run while a dev server (its agent queue always runs) polls the same database.
 */
import assert from 'node:assert/strict';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { AgentActionStatus, AgentRunStatus, ClubIntegrationType, NspadelBookingState, ParticipantRole } from '@prisma/client';
import type { AgentActionResult, AgentClientPlan, AgentClientReportResult, AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { loadAgentPrincipal, type AgentPrincipal } from '../access/agentPrincipal';
import { createAgentActionService } from '../agentActions.service';
import { createAgentChat, toAgentPendingActionDto } from '../agentChat.service';
import { mintSlotRef } from '../booking/slotEngine/slotRef';
import type { SlotProvider } from '../booking/slotEngine/providerRules';
import { createAgentClientExecutionService } from '../clientExecution/clientExecution.service';
import { getAgentClientPostStep } from '../clientExecution/clientPostSteps';
import { AGENT_BOOKING_I18N_EN } from '../i18n/agentBookingI18n';
import { getAgentToolRegistry } from '../tools';
import { AGENT_TOOL_AUTHZ_COVERAGE } from '../tools/__tests__/agentToolCoverage';
import { CREATE_GAME_WITH_BOOKING_TOOLS } from '../tools/createGameWithBooking.tools';
import type { AgentToolContext } from '../tools/registry';
import { WELTNER_ORIGIN } from '../../weltner/weltnerContract';

const TOOL = 'create_game_with_booking';
const TZ = 'Europe/Belgrade';
const NS_URL = 'https://agent-cgb-test.supabase.co';
const DAY = 24 * 60 * 60 * 1000;
const EN = AGENT_BOOKING_I18N_EN;

// --- fake Nspadel / Weltner (same shapes as agentBookCourt.integration.test.ts) ---------------

type Interval = { start_time: string; end_time: string };
const nsOccupied = new Map<string, Interval[]>();
const nsInsertMode = new Map<string, 'ok' | 'reject'>();
const nsInserts: Record<string, unknown>[] = [];
const weltnerTaken = new Map<string, string[]>();
const weltnerBooks: Record<string, unknown>[] = [];
const unexpected: string[] = [];

const NS_COURTS = ['ns-c1', 'ns-c2', 'ns-c3'].map((id, i) => ({
  id,
  name: `Teren ${i + 1}`,
  type: 'indoor',
  opening_time: '07:00:00',
  closing_time: '23:00:00',
  slot_interval_minutes: 30,
  allowed_durations: [60, 90, 120],
}));

const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function json(body: unknown, status = 200): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, string>) : null;
  if (url.startsWith(`${NS_URL}/rest/v1/courts`)) return json(NS_COURTS);
  if (url === `${NS_URL}/rest/v1/rpc/get_occupied_slots`) return json(nsOccupied.get(`${body!._court_id}|${body!._date}`) ?? []);
  if (url === `${NS_URL}/rest/v1/reservations` && init?.method === 'POST') {
    const key = `${body!.court_id}|${body!.date}`;
    if (nsInsertMode.get(`${key}|${body!.start_time}`) === 'reject') return json({ message: 'conflict' }, 409);
    nsInserts.push(body!);
    nsOccupied.set(key, [...(nsOccupied.get(key) ?? []), { start_time: `${body!.start_time}:00`, end_time: `${body!.end_time}:00` }]);
    return json(undefined, 201);
  }
  const availability = url.startsWith(`${WELTNER_ORIGIN}/api/availability/`) ? new URL(url) : null;
  if (availability) {
    const court = decodeURIComponent(availability.pathname.split('/').pop()!);
    const date = availability.searchParams.get('date')!;
    const taken = weltnerTaken.get(`${court}|${date}`) ?? [];
    const slots: { start: string; end: string; duration: number }[] = [];
    for (let m = 8 * 60; m <= 21 * 60; m += 30) {
      if (taken.some((t) => Math.abs(minutes(t) - m) < 120)) continue;
      for (const d of [60, 90]) slots.push({ start: clock(m), end: clock(m + d), duration: d });
    }
    return json({ court, date, slots });
  }
  if (url === `${WELTNER_ORIGIN}/api/book` && init?.method === 'POST') {
    const key = `${body!.court}|${body!.date}`;
    weltnerBooks.push(body!);
    weltnerTaken.set(key, [...(weltnerTaken.get(key) ?? []), body!.start]);
    return json({ success: true, bookingId: `w-${weltnerBooks.length}` });
  }
  unexpected.push(url);
  throw new Error(`unexpected outbound call in test: ${url}`);
};

type ToolData = { error?: string; message?: string; reason?: string };
type Preview = { title: string; warnings: string[]; lines: { label: string; to: string }[] };

async function expectApiError(promise: Promise<unknown>, status: number, code?: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError, `expected ApiError, got ${String(error)}`);
    assert.equal(error.statusCode, status, error.message);
    if (code) assert.equal(error.data?.code, code);
    return;
  }
  assert.fail(`expected ${status}`);
}

async function main(): Promise<void> {
  const realFetch = globalThis.fetch;
  const realAnonKey = process.env.NS_PADEL_SUPABASE_ANON_KEY;
  globalThis.fetch = fakeFetch as typeof fetch;
  process.env.NS_PADEL_SUPABASE_ANON_KEY = 'test-anon-key';

  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cityIds: string[] = [];
  const clubIds: string[] = [];
  const userIds: string[] = [];
  const chatIds: string[] = [];
  let tested = 0;
  const registry = getAgentToolRegistry();
  const runService = { enqueueFollowUpRun: async () => null };
  const actions = createAgentActionService({ runService: () => runService });
  const clientExec = createAgentClientExecutionService({ runService: () => runService });

  try {
    const city = await prisma.city.create({ data: { name: `Agent cgb city ${s}`, country: 'Test', timezone: TZ } });
    cityIds.push(city.id);
    const mkClub = async (name: string, integrationType: ClubIntegrationType, courts: { name: string; externalCourtId?: string }[], integrationConfig?: object) => {
      const club = await prisma.club.create({
        data: {
          name: `${name} ${s}`,
          normalizedName: `${name} ${s}`.toLowerCase(),
          address: 'Test street 1',
          cityId: city.id,
          integrationType,
          ...(integrationConfig ? { integrationConfig } : {}),
          courts: { create: courts },
        },
        include: { courts: { orderBy: { name: 'asc' } } },
      });
      clubIds.push(club.id);
      return club;
    };
    const nsClub = await mkClub('Agent cgb NS', ClubIntegrationType.NSPADELSUPABASE, NS_COURTS.map((c) => ({ name: c.name, externalCourtId: c.id })), { supabaseUrl: NS_URL });
    const wClub = await mkClub('Agent cgb Weltner', ClubIntegrationType.WELTNER, [
      { name: 'Teren A', externalCourtId: `cgb-a-${s}` },
      { name: 'Teren B', externalCourtId: `cgb-b-${s}` },
    ]);
    const btClub = await mkClub('Agent cgb BT', ClubIntegrationType.BOOKTIME, [
      { name: 'Court 1', externalCourtId: `cgb-bt-1-${s}` },
      { name: 'Court 2', externalCourtId: `cgb-bt-2-${s}` },
    ]);
    const ns = nsClub.courts;
    const wc = wClub.courts;
    const bt = btClub.courts;

    const mkUser = async (name: string, isTrainer = false) => {
      const user = await prisma.user.create({
        data: { firstName: name, lastName: 'Agent', phone: `+38163${Math.floor(Math.random() * 1e7)}`, currentCityId: city.id, isTrainer },
      });
      userIds.push(user.id);
      return loadAgentPrincipal(user.id);
    };
    const booker = await mkUser('Booker');
    const stranger = await mkUser('Stranger');
    const coach = await mkUser('Coach', true);
    await prisma.userClubWeltnerAuth.create({ data: { userId: booker.userId, clubId: wClub.id, phoneNumber: '+381601234567' } });
    await prisma.userClubBooktimeAuth.create({
      data: { userId: booker.userId, clubId: btClub.id, externalUserId: `ext-${booker.userId}`, accessToken: 'test-a', refreshToken: 'test-r' },
    });

    const date = formatInTimeZone(new Date(Date.now() + 4 * DAY), TZ, 'yyyy-MM-dd');
    const at = (time: string) => fromZonedTime(`${date}T${time}:00`, TZ).toISOString();
    const ref = (userId: string, clubId: string, courtIds: string[], time: string, provider: SlotProvider, durationMinutes = 90) =>
      mintSlotRef({ clubId, courtIds, start: at(time), durationMinutes, provider, userId });
    const fields = { sport: 'PADEL', templateId: 'PADEL_AMERICANO_24', isPublic: false };

    let callSeq = 0;
    const ctxFor = async (principal: AgentPrincipal, caps: string[] = []): Promise<AgentToolContext> => {
      const chat = await createAgentChat(principal.userId);
      chatIds.push(chat.id);
      const run = await prisma.agentRun.create({ data: { chatId: chat.id, userId: principal.userId, status: AgentRunStatus.COMPLETED, clientCaps: caps } });
      callSeq += 1;
      return { principal, locale: 'en', timezone: 'UTC', now: new Date(), runId: run.id, chatId: chat.id, callId: `call_cgb_${callSeq}`, clientCaps: run.clientCaps };
    };
    const call = async (principal: AgentPrincipal, args: Record<string, unknown>, caps: string[] = []) =>
      registry.executeTool(await ctxFor(principal, caps), TOOL, args);
    const propose = async (principal: AgentPrincipal, args: Record<string, unknown>, caps: string[] = []) => {
      const result = await call(principal, args, caps);
      assert.ok(result.ok && result.awaitingConfirmation, `${TOOL} proposes: ${JSON.stringify(result.data)}`);
      const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: result.awaitingConfirmation.actionId } });
      return { action, plan: (action.args as { plan: Record<string, unknown> }).plan };
    };
    const confirm = async (principal: AgentPrincipal, actionId: string) => {
      await actions.confirm(principal.userId, actionId, 'en');
      const row = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: actionId } });
      return { status: row.status, result: row.result as unknown as AgentActionResult };
    };
    const setPlan = async (actionId: string, plan: unknown) => {
      const row = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: actionId } });
      await prisma.agentPendingAction.update({ where: { id: actionId }, data: { args: { ...(row.args as object), plan } as object } });
    };
    const handoffs = (entities: AgentEntityRef[] | undefined) =>
      (entities ?? []).filter((e): e is Extract<AgentEntityRef, { type: 'handoff' }> => e.type === 'handoff').map((e) => e.url);
    const gameOf = (result: AgentActionResult) => result.entities?.find((e) => e.type === 'game');
    const gamesAt = (clubId: string, time: string) => prisma.game.count({ where: { clubId, startTime: new Date(at(time)) } });

    // --- Nspadel happy path ------------------------------------------------------------------
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, nsClub.id, [ns[0].id], '10:00', 'NSPADELSUPABASE'), ...fields });
      assert.equal((p.action.args as { riskTier: string }).riskTier, 'critical', 'critical tier');
      assert.equal(toAgentPendingActionDto(p.action).canAlwaysAllow, false, 'never "Always allow"');
      const preview = p.action.preview as Preview;
      assert.equal(preview.title, EN['preview.createWithBooking.title'].replace('{{club}}', nsClub.name));
      assert.equal(preview.warnings[0], EN['warn.booksAndCreates'], 'books AND creates, first');
      assert.ok(preview.warnings.includes(EN['warn.cancelViaClub']), 'book_court warning');
      assert.ok(preview.lines.some((l) => l.label === 'Format' && l.to.startsWith('Americano')), 'create_game format line');
      assert.ok(preview.lines.some((l) => l.to.includes('10:00') && l.to.includes(TZ)), 'club-local time + tz');
      assert.ok(preview.lines.some((l) => l.to === 'NS Padel'), 'provider line');
      assert.ok(preview.lines.some((l) => l.label === 'Visibility'), 'create_game settings lines');
      assert.equal(nsInserts.length, 0, 'nothing booked before confirm');

      const done = await confirm(booker, p.action.id);
      assert.equal(done.status, AgentActionStatus.EXECUTED, JSON.stringify(done.result));
      assert.ok(!done.result.partial);
      assert.equal(done.result.message, EN['result.createdWithBooking'].replace('{{count}}', '1'));
      assert.equal(nsInserts.length, 1, 'one reservation');
      const entity = gameOf(done.result);
      assert.ok(entity, 'game entity');
      const game = await prisma.game.findUniqueOrThrow({ where: { id: entity.id }, include: { participants: true, externalBookings: true } });
      assert.equal(game.clubId, nsClub.id);
      assert.equal(game.courtId, ns[0].id);
      assert.equal(game.hasBookedCourt, true);
      assert.equal(game.isPublic, false);
      assert.equal(game.startTime.toISOString(), at('10:00'));
      assert.equal(game.endTime.toISOString(), at('11:30'), 'times from the provider response');
      assert.equal(game.participants[0]?.role, ParticipantRole.OWNER);
      assert.equal(game.externalBookings.length, 1);
      assert.equal(game.externalBookings[0].externalBookingId, `nspadel:ns-c1:${date}:10:00`);
      assert.equal(game.externalBookings[0].bookedByUserId, booker.userId, 'booker = principal');
      assert.equal(game.externalBookings[0].courtId, ns[0].id);
      assert.ok(done.result.entities?.some((e) => e.type === 'booking'), 'booking entity');
      await confirm(booker, p.action.id);
      assert.equal(nsInserts.length, 1, 'double confirm books once');
      assert.equal(await gamesAt(nsClub.id, '10:00'), 1, 'double confirm creates once');
      tested += 24;
    }
    console.log('nspadel happy path: ok');

    // --- Weltner, 2 courts → one game on both -------------------------------------------------
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, wClub.id, [wc[0].id, wc[1].id], '12:00', 'WELTNER', 60), ...fields });
      assert.ok((p.action.preview as Preview).warnings.includes(EN['warn.weltnerContact']));
      const done = await confirm(booker, p.action.id);
      assert.equal(done.status, AgentActionStatus.EXECUTED, JSON.stringify(done.result));
      assert.equal(done.result.message, EN['result.createdWithBooking'].replace('{{count}}', '2'));
      const game = await prisma.game.findUniqueOrThrow({ where: { id: gameOf(done.result)!.id }, include: { externalBookings: true, gameCourts: true } });
      assert.deepEqual(game.gameCourts.map((gc) => gc.courtId).sort(), [wc[0].id, wc[1].id].sort(), 'both courts on the game');
      assert.equal(game.externalBookings.length, 2);
      assert.ok(game.externalBookings.every((b) => b.externalBookingId.startsWith('weltner:') && b.bookedByUserId === booker.userId));
      assert.equal(weltnerBooks.length, 2);
      tested += 7;
    }
    console.log('weltner 2 courts: ok');

    // --- create guard ----------------------------------------------------------------------------
    {
      const training = { sport: 'PADEL', entityType: 'TRAINING', isPublic: false };
      const r = await call(booker, { slotRef: ref(booker.userId, nsClub.id, [ns[1].id], '13:00', 'NSPADELSUPABASE'), ...training });
      assert.equal((r.data as ToolData).error, 'forbidden', 'TRAINING needs isTrainer');
      assert.ok(!r.awaitingConfirmation);
      // Trainer proposes, loses the flag before confirm → FAILED, nothing booked, no game.
      const p = await propose(coach, { slotRef: ref(coach.userId, nsClub.id, [ns[1].id], '13:00', 'NSPADELSUPABASE'), ...training });
      assert.ok((p.action.preview as Preview).lines.some((l) => l.to === 'Training'));
      await prisma.user.update({ where: { id: coach.userId }, data: { isTrainer: false } });
      const before = nsInserts.length;
      const done = await confirm(await loadAgentPrincipal(coach.userId), p.action.id);
      assert.equal(done.status, AgentActionStatus.FAILED);
      assert.equal(nsInserts.length, before, 'nothing booked');
      assert.equal(await gamesAt(nsClub.id, '13:00'), 0, 'no game');
      await prisma.user.update({ where: { id: coach.userId }, data: { isTrainer: true } });
      tested += 6;
    }
    console.log('create guard: ok');

    // --- booking fails → nothing created --------------------------------------------------------
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, nsClub.id, [ns[1].id], '15:00', 'NSPADELSUPABASE'), ...fields });
      nsOccupied.set(`ns-c2|${date}`, [...(nsOccupied.get(`ns-c2|${date}`) ?? []), { start_time: '15:00:00', end_time: '16:30:00' }]);
      const before = nsInserts.length;
      const done = await confirm(booker, p.action.id);
      assert.equal(done.status, AgentActionStatus.FAILED);
      assert.equal(done.result.message, `${EN['result.slotTaken']} ${EN['result.noGameCreated']}`);
      assert.equal(nsInserts.length, before);
      assert.equal(await gamesAt(nsClub.id, '15:00'), 0);

      nsInsertMode.set(`ns-c3|${date}|17:00`, 'reject');
      const q = await propose(booker, { slotRef: ref(booker.userId, nsClub.id, [ns[2].id], '17:00', 'NSPADELSUPABASE'), ...fields });
      const rejected = await confirm(booker, q.action.id);
      assert.equal(rejected.status, AgentActionStatus.FAILED);
      // The insert conflicts (409 → taken) after a free live re-check.
      assert.equal(rejected.result.message, `${EN['result.slotTaken']} ${EN['result.noGameCreated']}`);
      assert.equal(rejected.result.partial, undefined);
      assert.equal(await gamesAt(nsClub.id, '17:00'), 0);
      tested += 7;
    }
    console.log('booking fails → nothing created: ok');

    // --- game creation fails after booking → partial + handoff ---------------------------------
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, nsClub.id, [ns[0].id], '19:00', 'NSPADELSUPABASE', 60), ...fields });
      // `createGame` refuses (a GAME must have 2 or 4 players) after the court is booked.
      const plan = p.plan as { booking: unknown; create: { body: Record<string, unknown>; entityType: string } };
      await setPlan(p.action.id, { ...plan, create: { ...plan.create, body: { ...plan.create.body, maxParticipants: 3 } } });
      const done = await confirm(booker, p.action.id);
      assert.equal(done.status, AgentActionStatus.EXECUTED, JSON.stringify(done.result));
      assert.equal(done.result.partial, true);
      assert.equal(done.result.message, EN['result.gameNotCreated']);
      const handoff = handoffs(done.result.entities).find((u) => u.startsWith('/create-game?'));
      assert.ok(handoff && new URL(handoff, 'https://x').searchParams.get('bookingIds') === `nspadel:ns-c1:${date}:19:00`, `handoff: ${handoff}`);
      const receipt = await prisma.nspadelBooking.findFirstOrThrow({ where: { userId: booker.userId, startTime: '19:00' } });
      assert.equal(receipt.state, NspadelBookingState.CONFIRMED, 'the booking stays');
      assert.equal(await gamesAt(nsClub.id, '19:00'), 0, 'no game');
      tested += 6;
    }
    console.log('create fails after booking: ok');

    // --- partial multi-court → the game on the booked courts ------------------------------------
    {
      nsInsertMode.set(`ns-c3|${date}|20:30`, 'reject');
      const p = await propose(booker, { slotRef: ref(booker.userId, nsClub.id, ns.map((c) => c.id), '20:30', 'NSPADELSUPABASE', 60), ...fields });
      const done = await confirm(booker, p.action.id);
      assert.equal(done.status, AgentActionStatus.EXECUTED, JSON.stringify(done.result));
      assert.equal(done.result.partial, true);
      assert.ok(done.result.message?.startsWith('2 of 3 courts booked'), done.result.message ?? '');
      assert.ok(done.result.message?.includes(EN['result.gameCreatedWithBooked']));
      const game = await prisma.game.findUniqueOrThrow({ where: { id: gameOf(done.result)!.id }, include: { externalBookings: true } });
      assert.deepEqual(game.externalBookings.map((b) => b.courtId).sort(), [ns[0].id, ns[1].id].sort());
      tested += 5;
    }
    console.log('partial courts: ok');

    // --- strict input / foreign slotRef / no integration ------------------------------------
    {
      const good = ref(booker.userId, nsClub.id, [ns[1].id], '09:00', 'NSPADELSUPABASE');
      assert.equal(((await call(booker, { slotRef: good, ...fields, clubId: nsClub.id })).data as ToolData).error, 'invalid_arguments', 'no clubId');
      assert.equal(((await call(booker, { slotRef: good, ...fields, startTime: at('09:00') })).data as ToolData).error, 'invalid_arguments', 'no startTime');
      assert.equal(((await call(stranger, { slotRef: good, ...fields })).data as ToolData).message, EN['error.slotInvalid'], "another user's slotRef");
      // `createGame`'s roster rule is checked at propose, so the court is never booked for a game it would refuse.
      assert.equal(((await call(booker, { slotRef: good, ...fields, maxParticipants: 3 })).data as ToolData).error, 'bad_request', 'GAME needs 2 or 4 players');
      const offline = await call(stranger, { slotRef: ref(stranger.userId, btClub.id, [bt[0].id], '09:00', 'BOOKTIME'), ...fields }, ['booking-v1']);
      assert.equal((offline.data as ToolData).reason, 'not_connected');
      assert.deepEqual(handoffs(offline.entities), ['/profile/connected-clubs']);
      tested += 6;
    }
    console.log('strict input / refusals: ok');

    // --- client path (Booktime) ------------------------------------------------------------------
    type StoredClientPlan = { executor: string; clientPlan: AgentClientPlan; post: { booking: Record<string, unknown>; create: { body: Record<string, unknown> } } };
    const okResult = (plan: AgentClientPlan, courtId: string, bookingId: string, extra: Partial<AgentClientReportResult> = {}): AgentClientReportResult => ({
      provider: plan.provider,
      courtId,
      date: plan.date,
      start: plan.start,
      durationMinutes: plan.durationMinutes,
      ok: true,
      externalBookingId: bookingId,
      bookingRef: null,
      error: null,
      ...extra,
    });
    const claim = async (principal: AgentPrincipal, actionId: string) => {
      const claimed = await clientExec.claim(principal.userId, actionId, `key-${actionId}`);
      return { attemptId: claimed.attemptId, plan: claimed.clientPlan, action: claimed.action };
    };
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, btClub.id, [bt[0].id, bt[1].id], '18:00', 'BOOKTIME'), ...fields }, ['booking-v1']);
      const stored = p.plan as unknown as StoredClientPlan;
      assert.equal(stored.executor, 'client');
      assert.deepEqual(stored.clientPlan.postStep, { kind: 'create_game', gameId: null });
      assert.equal(stored.clientPlan.rollbackOnPartial, true);
      assert.equal(stored.clientPlan.start, '18:00');
      const dto = toAgentPendingActionDto(p.action);
      assert.equal(dto.execution, 'client');
      assert.equal(dto.riskTier, 'critical');
      assert.ok(!JSON.stringify(dto).includes('slotRef'), 'server-only post never reaches the DTO');
      const preview = p.action.preview as Preview;
      assert.ok(preview.warnings.includes(EN['warn.booksAndCreates']) && preview.warnings.includes(EN['warn.bookedInApp']));
      assert.ok(preview.warnings.includes(EN['warn.rollback']));
      await expectApiError(actions.confirm(booker.userId, p.action.id), 409, 'CLIENT_EXECUTION_REQUIRED');

      const { attemptId, plan } = await claim(booker, p.action.id);
      assert.ok(attemptId && plan);
      const ids = [`cgb-bt-g1-${s}`, `cgb-bt-g2-${s}`];
      const { action } = await clientExec.report(booker.userId, p.action.id, {
        attemptId,
        results: [okResult(plan, bt[0].id, ids[0]), okResult(plan, bt[1].id, ids[1])],
      });
      assert.equal(action.status, AgentActionStatus.EXECUTED, JSON.stringify(action.result));
      assert.ok(!action.result?.partial);
      assert.equal(action.result?.message, EN['result.createdWithBooking'].replace('{{count}}', '2'));
      const entity = action.result?.entities?.find((e) => e.type === 'game');
      assert.ok(entity);
      const game = await prisma.game.findUniqueOrThrow({ where: { id: entity.id }, include: { externalBookings: { orderBy: { externalBookingId: 'asc' } } } });
      assert.equal(game.clubId, btClub.id);
      assert.deepEqual(game.externalBookings.map((b) => b.externalBookingId), ids);
      for (const [i, link] of game.externalBookings.entries()) {
        assert.equal(link.bookedByUserId, booker.userId);
        assert.equal(link.courtId, bt[i].id);
        assert.equal(link.externalBookingProvider, ClubIntegrationType.BOOKTIME);
        assert.equal(link.bookingStart?.toISOString(), at('18:00'), 'times from the plan');
      }
      assert.equal(game.startTime.toISOString(), at('18:00'));
      assert.equal(await prisma.externalBookingMirror.count({ where: { userId: booker.userId, externalBookingId: { in: ids } } }), 2, 'mirror rows');
      tested += 25;
    }
    console.log('client path happy: ok');

    {
      // Game creation fails in the post-step → partial "Booked; game not created" + handoff.
      const p = await propose(booker, { slotRef: ref(booker.userId, btClub.id, [bt[0].id], '20:00', 'BOOKTIME', 60), ...fields }, ['booking-v1']);
      const stored = p.plan as unknown as StoredClientPlan;
      await setPlan(p.action.id, { ...stored, post: { ...stored.post, create: { ...stored.post.create, body: { ...stored.post.create.body, maxParticipants: 3 } } } });
      const { attemptId, plan } = await claim(booker, p.action.id);
      const id = `cgb-bt-fail-${s}`;
      const { action } = await clientExec.report(booker.userId, p.action.id, { attemptId: attemptId!, results: [okResult(plan!, bt[0].id, id)] });
      assert.equal(action.status, AgentActionStatus.EXECUTED, JSON.stringify(action.result));
      assert.equal(action.result?.partial, true);
      assert.equal(action.result?.message, EN['result.gameNotCreated']);
      const create = handoffs(action.result?.entities).find((u) => u.startsWith('/create-game?'));
      assert.ok(create && new URLSearchParams(create.split('?')[1]).get('bookingIds') === id, `handoff: ${create}`);
      assert.equal(await gamesAt(btClub.id, '20:00'), 0);
      assert.equal(await prisma.externalBookingMirror.count({ where: { externalBookingId: id } }), 1, 'booking recorded');

      // Post-step validation (on top of the generic report check): a plan that doesn't match its
      // server payload, or a result outside the planned slot, throws (→ the generic partial) and
      // records nothing.
      const postStep = getAgentClientPostStep(TOOL)!;
      const wctx = { principal: booker, locale: 'en', timezone: 'UTC', now: new Date() };
      const base = { actionId: p.action.id, clientPlan: plan!, post: stored.post, planned: 1 };
      await assert.rejects(
        postStep(wctx, { ...base, clientPlan: { ...plan!, courts: [{ courtId: bt[1].id, externalCourtId: bt[1].externalCourtId }] }, results: [], succeeded: [] }),
        /does not match/,
      );
      const off = okResult(plan!, bt[0].id, `cgb-off-${s}`, { start: '21:00' });
      await assert.rejects(postStep(wctx, { ...base, results: [off], succeeded: [off] }), /do not match the planned slot/);
      assert.equal(await prisma.externalBookingMirror.count({ where: { externalBookingId: `cgb-off-${s}` } }), 0);
      tested += 8;
    }
    console.log('client post-step failure + validation: ok');

    {
      // Create guard at claim: a trainer who lost the flag can't start the client booking.
      await prisma.userClubBooktimeAuth.create({
        data: { userId: coach.userId, clubId: btClub.id, externalUserId: `ext-${coach.userId}`, accessToken: 'test-a', refreshToken: 'test-r' },
      });
      const p = await propose(coach, { slotRef: ref(coach.userId, btClub.id, [bt[1].id], '10:00', 'BOOKTIME'), sport: 'PADEL', entityType: 'TRAINING', isPublic: false }, ['booking-v1']);
      await prisma.user.update({ where: { id: coach.userId }, data: { isTrainer: false } });
      const claimed = await claim(coach, p.action.id);
      assert.equal(claimed.attemptId, null, 'no attempt');
      assert.equal(claimed.action.status, AgentActionStatus.FAILED);
      tested += 2;
    }
    console.log('client create guard at claim: ok');

    assert.deepEqual(unexpected, [], 'no real outbound HTTP');
    for (const [name, kind] of Object.entries(AGENT_TOOL_AUTHZ_COVERAGE)) {
      if (kind === 'create-with-booking-cases') assert.ok(CREATE_GAME_WITH_BOOKING_TOOLS.some((t) => t.name === name), `${name} (${kind}) has no cases in this test`);
    }
    console.log(`agentCreateGameWithBooking.integration.test.ts: ok (${tested} cases)`);
  } finally {
    globalThis.fetch = realFetch;
    if (realAnonKey === undefined) delete process.env.NS_PADEL_SUPABASE_ANON_KEY;
    else process.env.NS_PADEL_SUPABASE_ANON_KEY = realAnonKey;
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error('chat cleanup failed', e));
    await prisma.game.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('game cleanup failed', e));
    await prisma.externalBookingMirror.deleteMany({ where: { userId: { in: userIds } } }).catch((e) => console.error('mirror cleanup failed', e));
    await prisma.nspadelBooking.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('receipt cleanup failed', e));
    await prisma.weltnerBooking.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('receipt cleanup failed', e));
    await prisma.userClubWeltnerAuth.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('auth cleanup failed', e));
    await prisma.userClubBooktimeAuth.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('auth cleanup failed', e));
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch((e) => console.error('user cleanup failed', e));
    await prisma.club.deleteMany({ where: { id: { in: clubIds } } }).catch((e) => console.error('club cleanup failed', e));
    await prisma.city.deleteMany({ where: { id: { in: cityIds } } }).catch((e) => console.error('city cleanup failed', e));
  }
}

main().then(
  async () => {
    await prisma.$disconnect();
    process.exit(0);
  },
  async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  },
);
