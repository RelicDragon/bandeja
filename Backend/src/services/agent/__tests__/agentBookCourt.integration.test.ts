/**
 * Phase-7d `book_court` + Nspadel receipts (real dev DB, no LLM, provider HTTP mocked: every
 * outbound `fetch` goes to the in-process fake below, anything else fails the test).
 *   - Nspadel happy path (receipt, `nspadel:` bookingRef in list_my_bookings, create-game handoff),
 *     double confirm → one reservation;
 *   - with gameId: Nspadel and Weltner bookings are linked (`GameExternalBooking`, booker, times
 *     from the provider response) and the linked booking is one `nspadel:` item;
 *   - slotRef: expired / tampered / another user's → refused at propose; a tampered stored plan
 *     or another principal → refused at confirm;
 *   - not connected (Weltner without a phone saved, Nspadel without a profile phone) → refusal
 *     with a handoff, no pending action; connection removed before confirm → FAILED;
 *   - game guards (non-organiser 403, hidden 404, other club 400), strict input;
 *   - slot taken at the live re-check → FAILED "nothing booked", no insert;
 *   - partial multi-court (Nspadel 2 of 3, Weltner 1 of 2) → EXECUTED partial + handoff;
 *   - upstream unknown → FAILED changed, receipt UNKNOWN listed as UNKNOWN, retry re-claims it;
 *   - receipt idempotency at the service level (same slot twice → one insert);
 *   - Booktime without a provider login / no-integration slots refused with a handoff (the
 *     client-executed Booktime path is `agentBookCourtClient.integration.test.ts`).
 * Token stripping in chat titles is covered in `agentStream.test.ts`.
 */
import assert from 'node:assert/strict';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import {
  AgentActionStatus,
  AgentRunStatus,
  ClubIntegrationType,
  EntityType,
  GameType,
  NspadelBookingState,
  ParticipantRole,
  ParticipantStatus,
  Sport,
  WeltnerBookingState,
} from '@prisma/client';
import type { AgentActionResult, AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { loadAgentPrincipal, type AgentPrincipal } from '../access/agentPrincipal';
import { createAgentActionService } from '../agentActions.service';
import { createAgentChat } from '../agentChat.service';
import { resolveBookingRef } from '../booking/agentBookingSources';
import { mintSlotRef } from '../booking/slotEngine/slotRef';
import type { SlotProvider } from '../booking/slotEngine/providerRules';
import { AGENT_BOOKING_I18N_EN } from '../i18n/agentBookingI18n';
import { getAgentToolRegistry } from '../tools';
import { AGENT_TOOL_AUTHZ_COVERAGE } from '../tools/__tests__/agentToolCoverage';
import { BOOK_COURT_TOOLS } from '../tools/bookCourt.tools';
import type { AgentToolContext } from '../tools/registry';
import { createNspadelBooking } from '../../nspadel/nspadelBookings.service';
import { WELTNER_ORIGIN } from '../../weltner/weltnerContract';

const TZ = 'Europe/Belgrade';
const NS_URL = 'https://agent-book-test.supabase.co';
const DAY = 24 * 60 * 60 * 1000;

// --- fake providers ---------------------------------------------------------------------------

type Interval = { start_time: string; end_time: string };
const nsOccupied = new Map<string, Interval[]>(); // `${court}|${date}`
const nsInsertMode = new Map<string, 'ok' | 'reject' | 'unknown'>(); // `${court}|${date}|${start}`
const nsInserts: Record<string, unknown>[] = [];
const weltnerTaken = new Map<string, string[]>(); // `${court}|${date}` → starts
const weltnerBookMode = new Map<string, 'ok' | 'reject'>(); // `${court}|${date}|${start}`
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

function weltnerSlots(court: string, date: string) {
  const taken = weltnerTaken.get(`${court}|${date}`) ?? [];
  const slots: { start: string; end: string; duration: number }[] = [];
  for (let m = 8 * 60; m <= 21 * 60; m += 30) {
    if (taken.some((t) => Math.abs(minutes(t) - m) < 120)) continue;
    for (const d of [60, 90]) slots.push({ start: clock(m), end: clock(m + d), duration: d });
  }
  return slots;
}

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
    const mode = nsInsertMode.get(`${key}|${body!.start_time}`) ?? 'ok';
    if (mode === 'reject') return json({ message: 'conflict' }, 409);
    if (mode === 'unknown') return json({ message: 'boom' }, 500);
    nsInserts.push(body!);
    nsOccupied.set(key, [...(nsOccupied.get(key) ?? []), { start_time: `${body!.start_time}:00`, end_time: `${body!.end_time}:00` }]);
    return json(undefined, 201);
  }
  const availability = url.startsWith(`${WELTNER_ORIGIN}/api/availability/`) ? new URL(url) : null;
  if (availability) {
    const court = decodeURIComponent(availability.pathname.split('/').pop()!);
    const date = availability.searchParams.get('date')!;
    return json({ court, date, slots: weltnerSlots(court, date) });
  }
  if (url === `${WELTNER_ORIGIN}/api/book` && init?.method === 'POST') {
    const key = `${body!.court}|${body!.date}`;
    if (weltnerBookMode.get(`${key}|${body!.start}`) === 'reject') return json({ error: 'taken' }, 409);
    weltnerBooks.push(body!);
    weltnerTaken.set(key, [...(weltnerTaken.get(key) ?? []), body!.start]);
    return json({ success: true, bookingId: `w-${weltnerBooks.length}` });
  }
  unexpected.push(url);
  throw new Error(`unexpected outbound call in test: ${url}`);
};

// --- test --------------------------------------------------------------------------------------

type ToolData = { error?: string; message?: string; reason?: string; status?: string };

async function main(): Promise<void> {
  const realFetch = globalThis.fetch;
  const realAnonKey = process.env.NS_PADEL_SUPABASE_ANON_KEY;
  globalThis.fetch = fakeFetch as typeof fetch;
  process.env.NS_PADEL_SUPABASE_ANON_KEY = 'test-anon-key';

  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cityIds: string[] = [];
  const clubIds: string[] = [];
  const userIds: string[] = [];
  const gameIds: string[] = [];
  const chatIds: string[] = [];
  let tested = 0;
  const registry = getAgentToolRegistry();
  const actions = createAgentActionService({ runService: () => ({ enqueueFollowUpRun: async () => null }) });

  try {
    const city = await prisma.city.create({ data: { name: `Agent book city ${s}`, country: 'Test', timezone: TZ } });
    cityIds.push(city.id);
    const mkClub = async (name: string, integrationType: ClubIntegrationType | null, courts: { name: string; externalCourtId?: string }[], integrationConfig?: object) => {
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
    const nsClub = await mkClub('Agent NS club', ClubIntegrationType.NSPADELSUPABASE, NS_COURTS.map((c) => ({ name: c.name, externalCourtId: c.id })), { supabaseUrl: NS_URL });
    const wClub = await mkClub('Agent Weltner club', ClubIntegrationType.WELTNER, [
      { name: 'Teren A', externalCourtId: `teren-a-${s}` },
      { name: 'Teren B', externalCourtId: `teren-b-${s}` },
    ]);
    const btClub = await mkClub('Agent Booktime club', ClubIntegrationType.BOOKTIME, [{ name: 'Court 1' }]);
    const plainClub = await mkClub('Agent plain club', null, [{ name: 'Court 1' }]);

    const mkUser = async (name: string, data: { lastName?: string; phone?: string | null }) => {
      const user = await prisma.user.create({
        data: { firstName: name, lastName: data.lastName ?? null, phone: data.phone ?? null, currentCityId: city.id },
      });
      userIds.push(user.id);
      return loadAgentPrincipal(user.id);
    };
    const booker = await mkUser('Booker', { lastName: 'Agent', phone: `+38160${Date.now() % 10_000_000}` });
    const stranger = await mkUser('Stranger', { lastName: 'Agent', phone: `+38161${Date.now() % 10_000_000}` });
    const noPhone = await mkUser('Nophone', { lastName: 'Agent' });
    await prisma.userClubWeltnerAuth.create({ data: { userId: booker.userId, clubId: wClub.id, phoneNumber: '+381601234567' } });

    const date = formatInTimeZone(new Date(Date.now() + 3 * DAY), TZ, 'yyyy-MM-dd');
    const at = (time: string) => fromZonedTime(`${date}T${time}:00`, TZ).toISOString();
    const ref = (userId: string, clubId: string, courtIds: string[], time: string, provider: SlotProvider, durationMinutes = 60, now?: Date) =>
      mintSlotRef({ clubId, courtIds, start: at(time), durationMinutes, provider, userId }, now ? { now } : {});
    const ns = nsClub.courts;
    const wc = wClub.courts;

    const mkGame = async (clubId: string, roster: [AgentPrincipal, ParticipantRole][], isPublic = true) => {
      const game = await prisma.game.create({
        data: {
          entityType: EntityType.GAME,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: city.id,
          clubId,
          startTime: new Date(at('20:00')),
          endTime: new Date(at('21:30')),
          timeIsSet: true,
          isPublic,
          participants: { create: roster.map(([p, role]) => ({ userId: p.userId, role, status: ParticipantStatus.PLAYING })) },
        },
        select: { id: true },
      });
      gameIds.push(game.id);
      return game.id;
    };

    let callSeq = 0;
    const ctxFor = async (principal: AgentPrincipal): Promise<AgentToolContext> => {
      const chat = await createAgentChat(principal.userId);
      chatIds.push(chat.id);
      const run = await prisma.agentRun.create({ data: { chatId: chat.id, userId: principal.userId, status: AgentRunStatus.COMPLETED } });
      callSeq += 1;
      return { principal, locale: 'en', timezone: 'UTC', now: new Date(), runId: run.id, chatId: chat.id, callId: `call_bc_${callSeq}` };
    };
    const call = async (principal: AgentPrincipal, args: Record<string, unknown>) =>
      registry.executeTool(await ctxFor(principal), 'book_court', args);
    const propose = async (principal: AgentPrincipal, args: Record<string, unknown>) => {
      const result = await call(principal, args);
      assert.ok(result.ok && result.awaitingConfirmation, `book_court proposes: ${JSON.stringify(result.data)}`);
      const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: result.awaitingConfirmation.actionId } });
      return { result, action, plan: (action.args as { plan: Record<string, unknown> }).plan };
    };
    const confirm = async (principal: AgentPrincipal, actionId: string) => {
      await actions.confirm(principal.userId, actionId, 'en');
      const row = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: actionId } });
      return { status: row.status, result: row.result as unknown as AgentActionResult };
    };
    const refused = async (principal: AgentPrincipal, args: Record<string, unknown>) => {
      const result = await call(principal, args);
      assert.ok(!result.awaitingConfirmation, 'no pending action');
      return result;
    };
    const handoffs = (entities: AgentEntityRef[] | undefined) =>
      (entities ?? []).filter((e): e is Extract<AgentEntityRef, { type: 'handoff' }> => e.type === 'handoff').map((e) => e.url);

    // --- Nspadel happy path + double confirm -------------------------------------------------
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, nsClub.id, [ns[0].id], '10:00', 'NSPADELSUPABASE') });
      assert.equal((p.action.args as { riskTier: string }).riskTier, 'critical', 'book_court is critical');
      const preview = p.action.preview as { title: string; warnings: string[]; lines: { label: string; to: string }[] };
      assert.ok(preview.warnings.includes(AGENT_BOOKING_I18N_EN['warn.cancelViaClub']), 'preview: cancel only via the club');
      assert.ok(preview.lines.some((l) => l.to.includes('10:00') && l.to.includes(TZ)), 'preview: club-local time + club tz');
      assert.ok(preview.lines.some((l) => l.to === 'NS Padel'), 'preview: provider');
      assert.equal(nsInserts.length, 0, 'nothing booked before confirm');

      const done = await confirm(booker, p.action.id);
      assert.equal(done.status, AgentActionStatus.EXECUTED, JSON.stringify(done.result));
      assert.ok(!done.result.partial);
      assert.equal(nsInserts.length, 1, 'one reservation');
      const receipt = await prisma.nspadelBooking.findFirstOrThrow({ where: { userId: booker.userId, clubId: nsClub.id, startTime: '10:00' } });
      assert.equal(receipt.state, NspadelBookingState.CONFIRMED);
      assert.equal(receipt.courtId, ns[0].id, 'receipt maps the upstream court to the app court');
      assert.equal(receipt.bookingStart.toISOString(), at('10:00'), 'receipt start in the club tz');
      assert.ok(handoffs(done.result.entities).some((u) => u.startsWith('/create-game?') && u.includes(encodeURIComponent(`nspadel:ns-c1:${date}:10:00`))), 'create-game handoff with bookingIds');
      assert.ok(done.result.entities?.some((e) => e.type === 'booking' && e.ref === `nspadel:${receipt.id}`), 'booking entity');

      // Double confirm (double tap / retry) → the same action, still one reservation.
      await confirm(booker, p.action.id);
      assert.equal(nsInserts.length, 1, 'double confirm books once');

      // Listed as the booker's own `nspadel:` booking; another user can't resolve it (user-typed refs too).
      const list = await registry.executeTool({ principal: booker, locale: 'en', timezone: 'UTC', now: new Date() }, 'list_my_bookings', { limit: 30 });
      const item = (list.data as { bookings: { bookingRef: string; state: string; canCancel: boolean }[] }).bookings.find((b) => b.bookingRef === `nspadel:${receipt.id}`);
      assert.equal(item?.state, 'CONFIRMED');
      assert.equal(item?.canCancel, false, 'Nspadel is cancelled via the club');
      await assert.rejects(resolveBookingRef(stranger, `nspadel:${receipt.id}`), /Booking not found/);
      await assert.rejects(resolveBookingRef(booker, `nspadel:${receipt.id}]`), /Booking not found/, 'malformed token remnant');
      tested += 10;
    }
    console.log('nspadel happy path: ok');

    // --- receipt idempotency at the service (the app's HTTP path) ---------------------------
    {
      const input = { clubId: nsClub.id, userId: booker.userId, courtId: 'ns-c2', date, startTime: '11:00', endTime: '12:00' };
      const first = await createNspadelBooking(input);
      const before = nsInserts.length;
      const again = await createNspadelBooking(input);
      assert.equal(again.receiptId, first.receiptId, 'same receipt');
      assert.equal(nsInserts.length, before, 'no second reservation for the same user slot');
      tested += 2;
    }
    console.log('receipt idempotency: ok');

    // --- with gameId: Nspadel + Weltner links ----------------------------------------------
    {
      const nsGame = await mkGame(nsClub.id, [[booker, ParticipantRole.OWNER]]);
      const p = await propose(booker, { slotRef: ref(booker.userId, nsClub.id, [ns[0].id], '12:00', 'NSPADELSUPABASE', 90), gameId: nsGame });
      const done = await confirm(booker, p.action.id);
      assert.equal(done.status, AgentActionStatus.EXECUTED, JSON.stringify(done.result));
      const link = await prisma.gameExternalBooking.findFirstOrThrow({ where: { gameId: nsGame } });
      assert.equal(link.externalBookingId, `nspadel:ns-c1:${date}:12:00`);
      assert.equal(link.bookedByUserId, booker.userId);
      assert.equal(link.courtId, ns[0].id);
      assert.equal(link.bookingStart?.toISOString(), at('12:00'));
      assert.equal(link.bookingEnd?.toISOString(), at('13:30'), 'times from the provider response');
      const receipt = await prisma.nspadelBooking.findFirstOrThrow({ where: { userId: booker.userId, startTime: '12:00' } });
      const item = await resolveBookingRef(booker, `geb:${link.id}`);
      assert.equal(item.ref, `nspadel:${receipt.id}`, 'the linked booking folds into the receipt item');
      assert.deepEqual(item.linkedGameIds, [nsGame]);

      const wGame = await mkGame(wClub.id, [[booker, ParticipantRole.OWNER]]);
      const wp = await propose(booker, { slotRef: ref(booker.userId, wClub.id, [wc[0].id], '14:00', 'WELTNER'), gameId: wGame });
      assert.ok((wp.action.preview as { warnings: string[] }).warnings.includes(AGENT_BOOKING_I18N_EN['warn.weltnerContact']));
      const wDone = await confirm(booker, wp.action.id);
      assert.equal(wDone.status, AgentActionStatus.EXECUTED, JSON.stringify(wDone.result));
      assert.equal(weltnerBooks.length, 1);
      const wReceipt = await prisma.weltnerBooking.findFirstOrThrow({ where: { userId: booker.userId, clubId: wClub.id } });
      assert.equal(wReceipt.state, WeltnerBookingState.CONFIRMED);
      const wLink = await prisma.gameExternalBooking.findFirstOrThrow({ where: { gameId: wGame } });
      assert.equal(wLink.externalBookingId, `weltner:${wReceipt.id}`);
      assert.equal(wLink.bookingStart?.toISOString(), at('14:00'));
      tested += 12;
    }
    console.log('gameId links: ok');

    // --- slotRef: expired / tampered / another user's; confirm-time re-verify ----------------
    {
      const expired = ref(booker.userId, nsClub.id, [ns[1].id], '15:00', 'NSPADELSUPABASE', 60, new Date(Date.now() - 16 * 60 * 1000));
      const r1 = await refused(booker, { slotRef: expired });
      assert.equal((r1.data as ToolData).error, 'bad_request');
      assert.equal((r1.data as ToolData).message, AGENT_BOOKING_I18N_EN['error.slotExpired']);
      const good = ref(booker.userId, nsClub.id, [ns[1].id], '15:00', 'NSPADELSUPABASE');
      const tampered = `${good.slice(0, -2)}${good.endsWith('AA') ? 'BB' : 'AA'}`;
      assert.equal(((await refused(booker, { slotRef: tampered })).data as ToolData).message, AGENT_BOOKING_I18N_EN['error.slotInvalid']);
      assert.equal(((await refused(stranger, { slotRef: good })).data as ToolData).message, AGENT_BOOKING_I18N_EN['error.slotInvalid'], "another user's slotRef");
      // Forged court list inside a re-signed-looking payload is still a bad signature.
      const [prefix, body, sig] = good.split('.');
      const forgedBody = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), k: [ns[2].id] })).toString('base64url');
      assert.equal(((await refused(booker, { slotRef: `${prefix}.${forgedBody}.${sig}` })).data as ToolData).error, 'bad_request');
      assert.equal(((await refused(booker, { slotRef: good, start: at('15:00') })).data as ToolData).error, 'invalid_arguments', 'strict input');

      const p = await propose(booker, { slotRef: good });
      const tool = BOOK_COURT_TOOLS[0];
      await assert.rejects(tool.confirm!.authorize(booker, { ...p.plan, slotRef: tampered }), /not valid/);
      await assert.rejects(tool.confirm!.authorize(stranger, p.plan), /not valid/, 'confirm re-verifies against the fresh principal');
      await assert.rejects(tool.confirm!.authorize(booker, { ...p.plan, courtIds: [ns[2].id] }), /does not match/);
      await prisma.agentPendingAction.update({ where: { id: p.action.id }, data: { status: AgentActionStatus.EXPIRED } });
      tested += 9;
    }
    console.log('slotRef verification: ok');

    // --- not connected -----------------------------------------------------------------------
    {
      const w = await refused(stranger, { slotRef: ref(stranger.userId, wClub.id, [wc[0].id], '16:00', 'WELTNER') });
      assert.ok(w.ok);
      assert.equal((w.data as ToolData).reason, 'not_connected');
      assert.deepEqual(handoffs(w.entities), ['/profile/connected-clubs']);
      const n = await refused(noPhone, { slotRef: ref(noPhone.userId, nsClub.id, [ns[1].id], '16:00', 'NSPADELSUPABASE') });
      assert.equal((n.data as ToolData).reason, 'profile_contact_required');
      assert.deepEqual(handoffs(n.entities), ['/profile']);

      // Connection removed between propose and confirm → FAILED, nothing booked.
      await prisma.userClubWeltnerAuth.create({ data: { userId: stranger.userId, clubId: wClub.id, phoneNumber: '+381609999999' } });
      const p = await propose(stranger, { slotRef: ref(stranger.userId, wClub.id, [wc[1].id], '16:00', 'WELTNER') });
      await prisma.userClubWeltnerAuth.deleteMany({ where: { userId: stranger.userId } });
      const before = weltnerBooks.length;
      const done = await confirm(stranger, p.action.id);
      assert.equal(done.status, AgentActionStatus.FAILED);
      assert.equal(weltnerBooks.length, before);
      tested += 7;
    }
    console.log('not connected: ok');

    // --- game guards -------------------------------------------------------------------------
    {
      const slotRef = ref(booker.userId, nsClub.id, [ns[1].id], '17:00', 'NSPADELSUPABASE');
      const notMine = await mkGame(nsClub.id, [[stranger, ParticipantRole.OWNER], [booker, ParticipantRole.PARTICIPANT]]);
      assert.equal(((await refused(booker, { slotRef, gameId: notMine })).data as ToolData).error, 'forbidden', 'player, not organiser');
      const hidden = await mkGame(nsClub.id, [[stranger, ParticipantRole.OWNER]], false);
      assert.equal(((await refused(booker, { slotRef, gameId: hidden })).data as ToolData).error, 'not_found', 'hidden game');
      const otherClub = await mkGame(wClub.id, [[booker, ParticipantRole.OWNER]]);
      assert.equal(((await refused(booker, { slotRef, gameId: otherClub })).data as ToolData).error, 'bad_request', 'other club');
      tested += 3;
    }
    console.log('game guards: ok');

    // --- slot taken at the live re-check -----------------------------------------------------
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, nsClub.id, [ns[1].id], '18:00', 'NSPADELSUPABASE') });
      nsOccupied.set(`ns-c2|${date}`, [...(nsOccupied.get(`ns-c2|${date}`) ?? []), { start_time: '18:00:00', end_time: '19:00:00' }]);
      const before = nsInserts.length;
      const done = await confirm(booker, p.action.id);
      assert.equal(done.status, AgentActionStatus.FAILED);
      assert.equal(done.result.message, AGENT_BOOKING_I18N_EN['result.slotTaken']);
      assert.equal(nsInserts.length, before, 'no insert');
      assert.equal(await prisma.nspadelBooking.count({ where: { userId: booker.userId, startTime: '18:00' } }), 0, 'no receipt');
      tested += 4;
    }
    console.log('slot taken: ok');

    // --- partial multi-court -----------------------------------------------------------------
    {
      nsInsertMode.set(`ns-c3|${date}|19:00`, 'reject');
      const p = await propose(booker, { slotRef: ref(booker.userId, nsClub.id, ns.map((c) => c.id), '19:00', 'NSPADELSUPABASE') });
      const done = await confirm(booker, p.action.id);
      assert.equal(done.status, AgentActionStatus.EXECUTED, JSON.stringify(done.result));
      assert.equal(done.result.partial, true);
      assert.ok(done.result.message?.startsWith('2 of 3 courts booked'), done.result.message ?? '');
      const handoff = handoffs(done.result.entities).find((u) => u.startsWith('/create-game?'));
      assert.ok(handoff && new URL(handoff, 'https://x').searchParams.get('bookingIds')?.split(',').length === 2, 'handoff with the 2 booked ids');
      const states = (await prisma.nspadelBooking.findMany({ where: { userId: booker.userId, startTime: '19:00' }, orderBy: { externalCourtId: 'asc' } })).map((r) => r.state);
      assert.deepEqual(states, [NspadelBookingState.CONFIRMED, NspadelBookingState.CONFIRMED, NspadelBookingState.REJECTED]);

      weltnerBookMode.set(`${wc[1].externalCourtId}|${date}|10:00`, 'reject');
      const wp = await propose(booker, { slotRef: ref(booker.userId, wClub.id, [wc[0].id, wc[1].id], '10:00', 'WELTNER') });
      const wDone = await confirm(booker, wp.action.id);
      assert.equal(wDone.status, AgentActionStatus.EXECUTED);
      assert.ok(wDone.result.partial && wDone.result.message?.startsWith('1 of 2 courts booked'));
      tested += 7;
    }
    console.log('partial multi-court: ok');

    // --- upstream unknown → FAILED (changed), receipt UNKNOWN, retry re-claims -----------------
    {
      nsInsertMode.set(`ns-c1|${date}|21:00`, 'unknown');
      const p = await propose(booker, { slotRef: ref(booker.userId, nsClub.id, [ns[0].id], '21:00', 'NSPADELSUPABASE') });
      const done = await confirm(booker, p.action.id);
      assert.equal(done.status, AgentActionStatus.FAILED);
      assert.equal(done.result.message, AGENT_BOOKING_I18N_EN['result.unknown']);
      const receipt = await prisma.nspadelBooking.findFirstOrThrow({ where: { userId: booker.userId, startTime: '21:00' } });
      assert.equal(receipt.state, NspadelBookingState.UNKNOWN);
      assert.equal((await resolveBookingRef(booker, `nspadel:${receipt.id}`)).state, 'UNKNOWN');
      // The slot is still free upstream → the insert never landed: a retry re-claims the same receipt.
      nsInsertMode.delete(`ns-c1|${date}|21:00`);
      await prisma.nspadelBooking.update({ where: { id: receipt.id }, data: { updatedAt: new Date(Date.now() - 5 * 60 * 1000) } });
      const retried = await createNspadelBooking({ clubId: nsClub.id, userId: booker.userId, courtId: 'ns-c1', date, startTime: '21:00', endTime: '22:00' });
      assert.equal(retried.receiptId, receipt.id);
      assert.equal((await prisma.nspadelBooking.findUniqueOrThrow({ where: { id: receipt.id } })).state, NspadelBookingState.CONFIRMED);
      tested += 5;
    }
    console.log('unknown outcome: ok');

    // --- Booktime without a connection (client path: agentBookCourtClient) / no integration ----
    {
      const bt = await refused(booker, { slotRef: ref(booker.userId, btClub.id, [btClub.courts[0].id], '10:00', 'BOOKTIME') });
      assert.ok(bt.ok);
      assert.equal((bt.data as ToolData).reason, 'not_connected');
      assert.deepEqual(handoffs(bt.entities), ['/profile/connected-clubs']);
      const plain = await refused(booker, { slotRef: ref(booker.userId, plainClub.id, [plainClub.courts[0].id], '10:00', 'NONE') });
      assert.equal((plain.data as ToolData).reason, 'no_online_booking');
      // A slotRef whose provider no longer matches the club is invalid.
      const stale = await refused(booker, { slotRef: ref(booker.userId, btClub.id, [btClub.courts[0].id], '10:00', 'WELTNER') });
      assert.equal((stale.data as ToolData).error, 'bad_request');
      tested += 5;
    }
    console.log('booktime / no integration refused: ok');

    assert.deepEqual(unexpected, [], 'no real outbound HTTP');
    for (const [name, kind] of Object.entries(AGENT_TOOL_AUTHZ_COVERAGE)) {
      if (kind === 'book-court-cases') assert.ok(BOOK_COURT_TOOLS.some((t) => t.name === name), `${name} (${kind}) has no cases in this test`);
    }
    console.log(`agentBookCourt.integration.test.ts: ok (${tested} cases)`);
  } finally {
    globalThis.fetch = realFetch;
    if (realAnonKey === undefined) delete process.env.NS_PADEL_SUPABASE_ANON_KEY;
    else process.env.NS_PADEL_SUPABASE_ANON_KEY = realAnonKey;
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error('chat cleanup failed', e));
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } }).catch((e) => console.error('game cleanup failed', e));
    await prisma.nspadelBooking.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('receipt cleanup failed', e));
    await prisma.weltnerBooking.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('receipt cleanup failed', e));
    await prisma.userClubWeltnerAuth.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('auth cleanup failed', e));
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
