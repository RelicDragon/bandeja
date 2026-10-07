/**
 * Slice 7g (book): `book_court` for Booktime / Padeloo / Klikteren as a client-executed action
 * (real dev DB, no LLM; every outbound `fetch` fails the test: the backend must never call
 * those providers).
 *   - proposal with the `booking-v1` cap: clientPlan (provider court ids, club-local date / start,
 *     duration, `rollbackOnPartial`), app wording, never "free"; `/confirm` → 409;
 *   - no caps (Telegram / old build): the same client-executed proposal;
 *   - not connected (no provider auth row) → refusal + Connected clubs handoff, no action;
 *   - claim → report → post-step: link to the game (booker, courts, times from the plan) +
 *     mirror rows; without gameId: mirror rows (listed by list_my_bookings) + create-game handoff;
 *   - a report outside the plan (court, time, rolledBack on a failed court) → 400;
 *   - rollback: all undone → FAILED "nothing booked"; undo failed → UNKNOWN naming the court,
 *     a repeat report is a no-op;
 *   - slotRef at confirm: expired but the action was proposed while it was valid → accepted
 *     (server and client plans); legacy plan without `proposedAt` → expired; tampered / another
 *     user's → rejected.
 * Don't run while a dev server (its agent queue always runs) polls the same database.
 */
import assert from 'node:assert/strict';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import {
  AgentActionStatus,
  AgentRunStatus,
  ClubIntegrationType,
  EntityType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  Sport,
} from '@prisma/client';
import type { AgentClientPlan, AgentClientReportResult, AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { loadAgentPrincipal, type AgentPrincipal } from '../access/agentPrincipal';
import { createAgentActionService } from '../agentActions.service';
import { createAgentChat, toAgentPendingActionDto } from '../agentChat.service';
import { mintSlotRef } from '../booking/slotEngine/slotRef';
import type { SlotProvider } from '../booking/slotEngine/providerRules';
import { createAgentClientExecutionService } from '../clientExecution/clientExecution.service';
import { AGENT_CLIENT_EXEC_I18N_EN } from '../clientExecution/clientExecutionI18n';
import { AGENT_BOOKING_I18N_EN } from '../i18n/agentBookingI18n';
import { getAgentToolRegistry } from '../tools';
import { BOOK_COURT_TOOLS } from '../tools/bookCourt.tools';
import type { AgentToolContext } from '../tools/registry';

const TZ = 'Europe/Belgrade';
const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;

type ToolData = { error?: string; message?: string; reason?: string };
type StoredPlan = { executor?: string; clientPlan: AgentClientPlan; post: Record<string, unknown> };

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
  const unexpected: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    unexpected.push(url);
    throw new Error(`unexpected outbound call in test: ${url}`);
  }) as typeof fetch;

  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const cityIds: string[] = [];
  const clubIds: string[] = [];
  const userIds: string[] = [];
  const gameIds: string[] = [];
  const chatIds: string[] = [];
  let tested = 0;
  const registry = getAgentToolRegistry();
  const runService = { enqueueFollowUpRun: async () => null };
  const actions = createAgentActionService({ runService: () => runService });
  const service = createAgentClientExecutionService({ runService: () => runService });

  try {
    const city = await prisma.city.create({ data: { name: `Agent client book city ${s}`, country: 'Test', timezone: TZ } });
    cityIds.push(city.id);
    const mkClub = async (name: string, integrationType: ClubIntegrationType, courts: { name: string; externalCourtId?: string }[]) => {
      const club = await prisma.club.create({
        data: {
          name: `${name} ${s}`,
          normalizedName: `${name} ${s}`.toLowerCase(),
          address: 'Test street 1',
          cityId: city.id,
          integrationType,
          courts: { create: courts },
        },
        include: { courts: { orderBy: { name: 'asc' } } },
      });
      clubIds.push(club.id);
      return club;
    };
    const btClub = await mkClub('Agent BT club', ClubIntegrationType.BOOKTIME, [
      { name: 'Court 1', externalCourtId: `bt-1-${s}` },
      { name: 'Court 2', externalCourtId: `bt-2-${s}` },
      { name: 'Court 3', externalCourtId: `bt-3-${s}` },
    ]);
    const wClub = await mkClub('Agent W club', ClubIntegrationType.WELTNER, [{ name: 'Teren A', externalCourtId: `w-a-${s}` }]);
    const bt = btClub.courts;

    const mkUser = async (name: string) => {
      const user = await prisma.user.create({
        data: { firstName: name, lastName: 'Agent', phone: `+38162${Math.floor(Math.random() * 1e7)}`, currentCityId: city.id },
      });
      userIds.push(user.id);
      return loadAgentPrincipal(user.id);
    };
    const booker = await mkUser('Booker');
    const stranger = await mkUser('Stranger');
    const offline = await mkUser('Offline');
    for (const p of [booker, stranger]) {
      await prisma.userClubBooktimeAuth.create({
        data: { userId: p.userId, clubId: btClub.id, externalUserId: `ext-${p.userId}`, accessToken: 'test-a', refreshToken: 'test-r' },
      });
    }
    await prisma.userClubWeltnerAuth.create({ data: { userId: booker.userId, clubId: wClub.id, phoneNumber: '+381601234567' } });

    const date = formatInTimeZone(new Date(Date.now() + 3 * DAY), TZ, 'yyyy-MM-dd');
    const at = (time: string) => fromZonedTime(`${date}T${time}:00`, TZ).toISOString();
    const ref = (userId: string, clubId: string, courtIds: string[], time: string, provider: SlotProvider, durationMinutes = 90, now?: Date) =>
      mintSlotRef({ clubId, courtIds, start: at(time), durationMinutes, provider, userId }, now ? { now } : {});

    const game = await prisma.game.create({
      data: {
        entityType: EntityType.GAME,
        sport: Sport.PADEL,
        gameType: GameType.CLASSIC,
        cityId: city.id,
        clubId: btClub.id,
        startTime: new Date(at('18:00')),
        endTime: new Date(at('19:30')),
        timeIsSet: true,
        isPublic: true,
        maxParticipants: 8, // two courts: the post-step books both
        participants: { create: [{ userId: booker.userId, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING }] },
      },
      select: { id: true },
    });
    gameIds.push(game.id);

    let callSeq = 0;
    const ctxFor = async (principal: AgentPrincipal, opts: { caps?: string[]; now?: Date } = {}): Promise<AgentToolContext> => {
      const chat = await createAgentChat(principal.userId);
      chatIds.push(chat.id);
      const run = await prisma.agentRun.create({
        data: { chatId: chat.id, userId: principal.userId, status: AgentRunStatus.COMPLETED, clientCaps: opts.caps ?? [] },
      });
      callSeq += 1;
      return {
        principal,
        locale: 'en',
        timezone: 'UTC',
        now: opts.now ?? new Date(),
        runId: run.id,
        chatId: chat.id,
        callId: `call_bcc_${callSeq}`,
        clientCaps: run.clientCaps,
      };
    };
    const propose = async (principal: AgentPrincipal, args: Record<string, unknown>, opts: { caps?: string[]; now?: Date } = { caps: ['booking-v1'] }) => {
      const result = await registry.executeTool(await ctxFor(principal, opts), 'book_court', args);
      assert.ok(result.ok && result.awaitingConfirmation, `book_court proposes: ${JSON.stringify(result.data)}`);
      const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: result.awaitingConfirmation.actionId } });
      return { action, plan: (action.args as unknown as { plan: StoredPlan }).plan };
    };
    const okResult = (plan: AgentClientPlan, courtId: string, bookingId: string | null, extra: Partial<AgentClientReportResult> = {}): AgentClientReportResult => ({
      provider: plan.provider,
      courtId,
      date: plan.date,
      start: plan.start,
      durationMinutes: plan.durationMinutes,
      ok: bookingId !== null,
      externalBookingId: bookingId,
      bookingRef: null,
      error: bookingId ? null : 'slot_taken',
      ...extra,
    });
    const claim = async (principal: AgentPrincipal, actionId: string) => {
      const claimed = await service.claim(principal.userId, actionId, `key-${actionId}`);
      assert.ok(claimed.attemptId && claimed.clientPlan, `claimed: ${JSON.stringify(claimed.action.result)}`);
      return { attemptId: claimed.attemptId, plan: claimed.clientPlan };
    };
    const handoffs = (entities: AgentEntityRef[] | undefined) =>
      (entities ?? []).filter((e): e is Extract<AgentEntityRef, { type: 'handoff' }> => e.type === 'handoff').map((e) => e.url);
    const listRefs = async () => {
      const list = await registry.executeTool({ principal: booker, locale: 'en', timezone: 'UTC', now: new Date() }, 'list_my_bookings', { limit: 30 });
      return (list.data as { bookings: { bookingRef: string; state: string }[] }).bookings;
    };

    // --- proposal with caps: client plan, app wording; /confirm → 409 -------------------------
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, btClub.id, [bt[0].id, bt[1].id], '18:00', 'BOOKTIME') });
      assert.equal(p.plan.executor, 'client');
      const cp = p.plan.clientPlan;
      assert.equal(cp.provider, 'BOOKTIME');
      assert.equal(cp.clubId, btClub.id);
      assert.deepEqual(cp.courts, [
        { courtId: bt[0].id, externalCourtId: bt[0].externalCourtId },
        { courtId: bt[1].id, externalCourtId: bt[1].externalCourtId },
      ]);
      assert.equal(cp.date, date);
      assert.equal(cp.start, '18:00', 'club-local start');
      assert.equal(cp.durationMinutes, 90);
      assert.equal(cp.operation, 'book');
      assert.equal(cp.rollbackOnPartial, true);
      assert.deepEqual(cp.postStep, { kind: 'none', gameId: null });
      const dto = toAgentPendingActionDto(p.action);
      assert.equal(dto.execution, 'client');
      assert.equal(dto.riskTier, 'critical');
      const preview = p.action.preview as { warnings: string[]; lines: { to: string }[] };
      assert.ok(preview.warnings.includes(AGENT_BOOKING_I18N_EN['warn.bookedInApp']), 'preview: booked in the app, re-checked');
      assert.ok(preview.warnings.includes(AGENT_BOOKING_I18N_EN['warn.rollback']), 'preview: multi-court rollback');
      assert.ok(preview.lines.some((l) => l.to === 'Booktime'));
      assert.ok(!JSON.stringify(preview).toLowerCase().includes('free'), 'snapshot wording never says free');
      assert.ok(!JSON.stringify(dto).includes('slotRef'), 'server-only post payload never reaches the DTO');
      await expectApiError(actions.confirm(booker.userId, p.action.id), 409, 'CLIENT_EXECUTION_REQUIRED');
      await prisma.agentPendingAction.update({ where: { id: p.action.id }, data: { status: AgentActionStatus.EXPIRED } });
      tested += 14;
    }
    console.log('client proposal with caps: ok');

    // --- no caps (Telegram / old build): the same client-executed proposal ---------------------
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, btClub.id, [bt[0].id], '09:00', 'BOOKTIME') }, { caps: [] });
      assert.equal(p.plan.executor, 'client');
      assert.equal(toAgentPendingActionDto(p.action).execution, 'client');
      await prisma.agentPendingAction.update({ where: { id: p.action.id }, data: { status: AgentActionStatus.EXPIRED } });
      tested += 2;
    }
    console.log('no caps → client action (Open in app): ok');

    // --- not connected -------------------------------------------------------------------------
    {
      const result = await registry.executeTool(await ctxFor(offline, { caps: ['booking-v1'] }), 'book_court', {
        slotRef: ref(offline.userId, btClub.id, [bt[0].id], '10:00', 'BOOKTIME'),
      });
      assert.ok(!result.awaitingConfirmation);
      assert.equal((result.data as ToolData).reason, 'not_connected');
      assert.equal((result.data as ToolData).message, AGENT_BOOKING_I18N_EN['refuse.clientNotConnected']);
      assert.deepEqual(handoffs(result.entities), ['/profile/connected-clubs']);
      tested += 3;
    }
    console.log('not connected: ok');

    // --- more courts than the game needs (agent chat 2026-10-07: 4 courts for 4 players) --------
    {
      await prisma.game.update({ where: { id: game.id }, data: { maxParticipants: 4 } });
      const result = await registry.executeTool(await ctxFor(booker, { caps: ['booking-v1'] }), 'book_court', {
        slotRef: ref(booker.userId, btClub.id, [bt[0].id, bt[1].id], '18:00', 'BOOKTIME'),
        gameId: game.id,
      });
      assert.equal(result.ok, false, 'two courts for a 4-player game are refused');
      assert.match(String((result.data as ToolData).message), /needs 1/);
      await prisma.game.update({ where: { id: game.id }, data: { maxParticipants: 8 } });
      tested += 2;
    }
    console.log('courts beyond the game refused: ok');

    // --- post-step: link to game + mirror ------------------------------------------------------
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, btClub.id, [bt[0].id, bt[1].id], '18:00', 'BOOKTIME'), gameId: game.id });
      assert.deepEqual(p.plan.clientPlan.postStep, { kind: 'link_game', gameId: game.id });
      const { attemptId, plan } = await claim(booker, p.action.id);
      const ids = [`bt-g1-${s}`, `bt-g2-${s}`];
      const { action } = await service.report(booker.userId, p.action.id, {
        attemptId,
        results: [okResult(plan, bt[0].id, ids[0], { price: 30 }), okResult(plan, bt[1].id, ids[1])],
      });
      assert.equal(action.status, AgentActionStatus.EXECUTED, JSON.stringify(action.result));
      assert.ok(!action.result?.partial);
      assert.equal(action.result?.message, AGENT_BOOKING_I18N_EN['result.bookedLinked'].replace('{{count}}', '2'));
      const links = await prisma.gameExternalBooking.findMany({ where: { gameId: game.id }, orderBy: { externalBookingId: 'asc' } });
      assert.deepEqual(links.map((l) => l.externalBookingId), ids);
      for (const [i, link] of links.entries()) {
        assert.equal(link.bookedByUserId, booker.userId, 'booker = principal');
        assert.equal(link.courtId, bt[i].id);
        assert.equal(link.bookingStart?.toISOString(), at('18:00'));
        assert.equal(link.bookingEnd?.toISOString(), at('19:30'), 'times from the plan');
      }
      const mirror = await prisma.externalBookingMirror.findMany({ where: { userId: booker.userId, externalBookingId: { in: ids } } });
      assert.equal(mirror.length, 2, 'mirror rows upserted');
      assert.ok(action.result?.entities?.some((e) => e.type === 'booking'), 'booking entities');
      assert.ok(!handoffs(action.result?.entities).some((u) => u.startsWith('/create-game')), 'no create handoff with a game');
      tested += 12;
    }
    console.log('post-step link to game + mirror: ok');

    // --- post-step without game: mirror (listed) + create-game handoff --------------------------
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, btClub.id, [bt[2].id], '20:00', 'BOOKTIME', 60) });
      const { attemptId, plan } = await claim(booker, p.action.id);
      const id = `bt-solo-${s}`;
      const { action } = await service.report(booker.userId, p.action.id, { attemptId, results: [okResult(plan, bt[2].id, id)] });
      assert.equal(action.status, AgentActionStatus.EXECUTED, JSON.stringify(action.result));
      const urls = handoffs(action.result?.entities);
      const create = urls.find((u) => u.startsWith('/create-game?'));
      assert.ok(create, `create-game handoff: ${urls.join(' ')}`);
      const q = new URLSearchParams(create.split('?')[1]);
      assert.equal(q.get('clubId'), btClub.id);
      assert.equal(q.get('courtId'), bt[2].id);
      assert.equal(q.get('bookingIds'), id);
      assert.equal(q.get('startTime'), at('20:00'));
      assert.equal(q.get('endTime'), at('21:00'));
      const row = await prisma.externalBookingMirror.findFirstOrThrow({ where: { userId: booker.userId, externalBookingId: id } });
      assert.equal(row.bookingStart.toISOString(), at('20:00'));
      const listed = (await listRefs()).find((b) => b.bookingRef === `mirror:${row.id}`);
      assert.equal(listed?.state, 'CONFIRMED', 'list_my_bookings sees it right away');
      tested += 9;
    }
    console.log('post-step create-game handoff + listed: ok');

    // --- report outside the plan → 400 -----------------------------------------------------------
    {
      const p = await propose(booker, { slotRef: ref(booker.userId, btClub.id, [bt[0].id, bt[1].id], '12:00', 'BOOKTIME') });
      const { attemptId, plan } = await claim(booker, p.action.id);
      await expectApiError(service.report(booker.userId, p.action.id, { attemptId, results: [okResult(plan, bt[2].id, 'x-1')] }), 400);
      await expectApiError(service.report(booker.userId, p.action.id, { attemptId, results: [okResult(plan, bt[0].id, 'x-1', { start: '12:30' })] }), 400);
      await expectApiError(
        service.report(booker.userId, p.action.id, {
          attemptId,
          results: [okResult(plan, bt[0].id, null, { rolledBack: true }), okResult(plan, bt[1].id, null)],
        }),
        400,
      );
      await expectApiError(
        service.report(booker.userId, p.action.id, {
          attemptId,
          results: [okResult(plan, bt[0].id, 'x-1'), okResult(plan, bt[1].id, 'x-2'), okResult(plan, bt[1].id, 'x-3')],
        }),
        400,
      );
      assert.equal((await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: p.action.id } })).status, AgentActionStatus.CONFIRMED);
      await prisma.agentPendingAction.update({ where: { id: p.action.id }, data: { status: AgentActionStatus.EXPIRED } });
      tested += 5;
    }
    console.log('report outside the plan rejected: ok');

    // --- rollback outcomes -------------------------------------------------------------------------
    {
      // Court 1 booked, court 2 taken, court 3 skipped; court 1 cancelled again → FAILED, nothing booked.
      const p = await propose(booker, { slotRef: ref(booker.userId, btClub.id, [bt[0].id, bt[1].id, bt[2].id], '14:00', 'BOOKTIME') });
      const { attemptId, plan } = await claim(booker, p.action.id);
      const { action } = await service.report(booker.userId, p.action.id, {
        attemptId,
        results: [okResult(plan, bt[0].id, `rb-1-${s}`, { rolledBack: true }), okResult(plan, bt[1].id, null), okResult(plan, bt[2].id, null)],
      });
      assert.equal(action.status, AgentActionStatus.FAILED);
      assert.equal(action.result?.message, AGENT_CLIENT_EXEC_I18N_EN.rolledBack);
      assert.equal(await prisma.externalBookingMirror.count({ where: { externalBookingId: `rb-1-${s}` } }), 0, 'no post-step');

      // Undo failed for court 2 → UNKNOWN naming it; a repeat report is a no-op.
      const q = await propose(booker, { slotRef: ref(booker.userId, btClub.id, [bt[0].id, bt[1].id, bt[2].id], '16:00', 'BOOKTIME') });
      const second = await claim(booker, q.action.id);
      const body = {
        attemptId: second.attemptId,
        results: [
          okResult(second.plan, bt[0].id, `rb-2-${s}`, { rolledBack: true }),
          okResult(second.plan, bt[1].id, `rb-3-${s}`, { rolledBack: false, error: 'cancel failed' }),
          okResult(second.plan, bt[2].id, null),
        ],
      };
      const unknown = await service.report(booker.userId, q.action.id, body);
      assert.equal(unknown.action.status, AgentActionStatus.UNKNOWN);
      assert.equal(unknown.action.result?.message, AGENT_CLIENT_EXEC_I18N_EN.rollbackFailed.replace('{{courts}}', 'Court 2'));
      assert.deepEqual(handoffs(unknown.action.result?.entities), ['/profile/connected-clubs']);
      const messagesBefore = await prisma.agentMessage.count({ where: { chatId: q.action.chatId } });
      await prisma.agentPendingAction.update({ where: { id: q.action.id }, data: { reportedAt: new Date(Date.now() - 10 * MIN) } });
      const again = await service.report(booker.userId, q.action.id, body);
      assert.equal(again.action.status, AgentActionStatus.UNKNOWN);
      assert.equal(await prisma.agentMessage.count({ where: { chatId: q.action.chatId } }), messagesBefore, 'no second outcome');
      tested += 8;
    }
    console.log('rollback outcomes: ok');

    // --- slotRef at confirm: expired ref of a still-valid action --------------------------------
    {
      const tool = BOOK_COURT_TOOLS[0];
      const proposedAt = new Date(Date.now() - 10 * MIN);
      const mintedAt = new Date(Date.now() - 20 * MIN); // valid until 5 min ago; valid when proposed

      // Client plan: claim succeeds.
      const c = await propose(
        booker,
        { slotRef: ref(booker.userId, btClub.id, [bt[0].id], '11:00', 'BOOKTIME', 60, mintedAt) },
        { caps: ['booking-v1'], now: proposedAt },
      );
      const claimed = await claim(booker, c.action.id);
      assert.ok(claimed.attemptId, 'expired ref, valid action → claim accepted');
      const cRef = String(c.plan.post.slotRef);
      const cTampered = `${cRef.slice(0, -2)}${cRef.endsWith('AA') ? 'BB' : 'AA'}`;
      await assert.rejects(tool.confirm!.authorize(booker, { ...c.plan, post: { ...c.plan.post, slotRef: cTampered } }), /not valid/, 'tampered ref');
      await assert.rejects(tool.confirm!.authorize(stranger, c.plan), /not valid/, "another user's ref");
      await prisma.agentPendingAction.update({ where: { id: c.action.id }, data: { status: AgentActionStatus.EXPIRED } });

      // Server plan (Weltner): authorize accepts; the same plan without `proposedAt` is expired.
      const w = await propose(
        booker,
        { slotRef: ref(booker.userId, wClub.id, [wClub.courts[0].id], '11:00', 'WELTNER', 60, mintedAt) },
        { caps: [], now: proposedAt },
      );
      const serverPlan = w.plan as unknown as Record<string, unknown>;
      assert.equal(serverPlan.proposedAt, proposedAt.toISOString());
      await tool.confirm!.authorize(booker, serverPlan);
      const legacy = { ...serverPlan };
      delete legacy.proposedAt;
      await assert.rejects(tool.confirm!.authorize(booker, legacy), (e: unknown) => e instanceof ApiError && e.message === AGENT_BOOKING_I18N_EN['error.slotExpired']);
      const good = String(serverPlan.slotRef);
      await assert.rejects(tool.confirm!.authorize(booker, { ...serverPlan, slotRef: `${good.slice(0, -2)}${good.endsWith('AA') ? 'BB' : 'AA'}` }), /not valid/);
      await assert.rejects(tool.confirm!.authorize(stranger, serverPlan), /not valid/);
      await prisma.agentPendingAction.update({ where: { id: w.action.id }, data: { status: AgentActionStatus.EXPIRED } });
      tested += 7;
    }
    console.log('slotRef at confirm: ok');

    assert.deepEqual(unexpected, [], 'no outbound HTTP (never Booktime / Padeloo from the backend)');
    console.log(`agentBookCourtClient.integration.test.ts: ok (${tested} cases)`);
  } finally {
    globalThis.fetch = realFetch;
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error('chat cleanup failed', e));
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } }).catch((e) => console.error('game cleanup failed', e));
    await prisma.externalBookingMirror.deleteMany({ where: { userId: { in: userIds } } }).catch((e) => console.error('mirror cleanup failed', e));
    await prisma.userClubBooktimeAuth.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('auth cleanup failed', e));
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
