/**
 * Slice 7g `cancel_booking` (real dev DB, no LLM, no provider calls: the app side is simulated
 * by claim + report through `AgentClientExecutionService`):
 *   - happy path: client plan from the server row (provider id never from the model), preview
 *     (club, courts, club time, "will be removed from game", "stays linked"), report → unlinked
 *     from the games the user may edit, kept on a game they can't edit (said in the result),
 *     mirror row CANCELLED, games NOT deleted;
 *   - refusals: not the booker → 403; another user's ref → 404; Weltner / Nspadel → "only the club"
 *     with the club's phone + `/clubs/:id` handoff and nothing proposed; started → 400;
 *   - claim re-checks the booker (lost → FAILED, nothing reaches the app);
 *   - no caps (Telegram / old builds): still a client card, `/confirm` → 409 CLIENT_EXECUTION_REQUIRED;
 *   - critical: ALWAYS_ALLOW can't be stored, never auto-approved; strict input.
 * Don't run while a dev server (its agent queue always runs) polls the same database.
 */
import assert from 'node:assert/strict';
import {
  AgentActionStatus,
  AgentRunStatus,
  ClubIntegrationType,
  EntityType,
  ExternalBookingMirrorState,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  Sport,
} from '@prisma/client';
import type { AgentActionPreview, AgentActionResult, AgentClientPlan, AgentClientReportResult } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import {
  classifyAgentOutcome,
  createAgentPermissionFixture,
} from '../access/__tests__/agentPermissionMatrix';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { autoApproveAgentAction } from '../agentActionAutoApprove';
import { createAgentActionService } from '../agentActions.service';
import { createAgentChat, toAgentPendingActionDto } from '../agentChat.service';
import { AgentToolPermissionService } from '../agentToolPermission.service';
import { resolveBookingRef } from '../booking/agentBookingSources';
import { createAgentClientExecutionService } from '../clientExecution/clientExecution.service';
import { AGENT_CANCEL_BOOKING_I18N_EN } from '../i18n/agentCancelBookingI18n';
import { AGENT_TOOL_DEFINITIONS } from '../tools';
import { AGENT_TOOL_AUTHZ_COVERAGE } from '../tools/__tests__/agentToolCoverage';
import { AgentToolRegistry, type AgentToolContext } from '../tools/registry';

const registry = new AgentToolRegistry(AGENT_TOOL_DEFINITIONS);
const cancelBooking = registry.get('cancel_booking')!;
const HOUR = 60 * 60 * 1000;
const EN = AGENT_CANCEL_BOOKING_I18N_EN;

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
  assert.ok(cancelBooking, 'cancel_booking registered');
  assert.equal(cancelBooking.riskTier, 'critical');
  assert.equal(AGENT_TOOL_AUTHZ_COVERAGE.cancel_booking, 'cancel-booking-cases');
  assert.equal(cancelBooking.input.safeParse({ bookingRef: 'geb:x', externalBookingId: 'bt-1' }).success, false, 'strict input');
  assert.equal(cancelBooking.input.safeParse({}).success, false, 'bookingRef required');

  const fixture = await createAgentPermissionFixture();
  const s = fixture.suffix;
  const P = fixture.principals;
  const clubIds: string[] = [];
  const gameIds: string[] = [];
  const chatIds: string[] = [];
  const followUps: string[] = [];
  const runService = {
    enqueueFollowUpRun: async (input: { chatId: string }) => {
      followUps.push(input.chatId);
      return `follow-up-${followUps.length}`;
    },
  };
  const service = createAgentClientExecutionService({ registry: () => registry, runService: () => runService });
  const actions = createAgentActionService({ registry: () => registry, runService: () => runService });
  try {
    const mkClub = async (name: string, integrationType: ClubIntegrationType, phone: string | null = null) => {
      const club = await prisma.club.create({
        data: {
          name: `${name} ${s}`,
          normalizedName: `${name.toLowerCase()} ${s}`,
          address: 'Test street 1',
          cityId: fixture.cityId,
          integrationType,
          phone,
          courts: { create: [{ name: 'Court 1' }, { name: 'Court 2' }] },
        },
        include: { courts: { orderBy: { name: 'asc' } } },
      });
      clubIds.push(club.id);
      return club;
    };
    const booktime = await mkClub('Agent cancel bt', ClubIntegrationType.BOOKTIME);
    const weltner = await mkClub('Agent cancel weltner', ClubIntegrationType.WELTNER, '+381 11 555 0101');
    const nspadel = await mkClub('Agent cancel nspadel', ClubIntegrationType.NSPADELSUPABASE);

    const mkGame = async (name: string, clubId: string, owner: AgentPrincipal) => {
      const game = await prisma.game.create({
        data: {
          name: `${name} ${s}`,
          entityType: EntityType.GAME,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: fixture.cityId,
          clubId,
          startTime: new Date(Date.now() + 24 * HOUR),
          endTime: new Date(Date.now() + 25 * HOUR),
          timeIsSet: true,
          isPublic: true,
          participants: {
            create: [
              { userId: owner.userId, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
              ...(owner.userId === P.owner.userId
                ? []
                : [{ userId: P.owner.userId, role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING }]),
            ],
          },
        },
        select: { id: true },
      });
      gameIds.push(game.id);
      return game.id;
    };
    const geb = (
      gameId: string,
      externalBookingId: string,
      provider: ClubIntegrationType,
      courtId: string,
      bookedByUserId: string | null,
      startOffsetMs = 24 * HOUR,
    ) =>
      prisma.gameExternalBooking.create({
        data: {
          gameId,
          externalBookingId,
          externalBookingProvider: provider,
          courtId,
          bookingStart: new Date(Date.now() + startOffsetMs),
          bookingEnd: new Date(Date.now() + startOffsetMs + 90 * 60 * 1000),
          bookedByUserId,
        },
      });

    let callSeq = 0;
    const ctxFor = async (principal: AgentPrincipal, caps: string[] = ['booking-v1']): Promise<AgentToolContext> => {
      const chat = await createAgentChat(principal.userId);
      chatIds.push(chat.id);
      const run = await prisma.agentRun.create({
        data: { chatId: chat.id, userId: principal.userId, status: AgentRunStatus.COMPLETED, clientCaps: caps },
      });
      callSeq += 1;
      return {
        principal,
        locale: 'en',
        timezone: 'UTC',
        now: new Date(),
        runId: run.id,
        chatId: chat.id,
        callId: `call_cb_${callSeq}`,
        clientCaps: caps,
      };
    };
    const call = async (principal: AgentPrincipal, bookingRef: string, caps?: string[]) => {
      const result = await cancelBooking.handler(await ctxFor(principal, caps), cancelBooking.input.parse({ bookingRef }));
      if (!result.awaitingConfirmation) return { result, action: null, plan: null, preview: null };
      const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: result.awaitingConfirmation.actionId } });
      const plan = (action.args as unknown as { plan: { executor: string; clientPlan: AgentClientPlan; post: unknown } }).plan;
      return { result, action, plan, preview: action.preview as unknown as AgentActionPreview };
    };
    const cancelResult = (plan: AgentClientPlan, i: number, ok: boolean): AgentClientReportResult => ({
      provider: plan.provider,
      courtId: plan.bookings[i].courtId,
      date: plan.date,
      start: plan.start,
      durationMinutes: plan.durationMinutes,
      ok,
      externalBookingId: plan.bookings[i].externalBookingId,
      bookingRef: plan.bookings[i].bookingRef,
      error: ok ? null : 'provider_error',
    });
    const runInApp = async (principal: AgentPrincipal, actionId: string, ok: boolean[]) => {
      const claim = await service.claim(principal.userId, actionId, `device-${actionId}`);
      if (!claim.attemptId || !claim.clientPlan) return { claim, reported: null };
      const plan = claim.clientPlan;
      const reported = await service.report(principal.userId, actionId, {
        attemptId: claim.attemptId,
        results: ok.map((v, i) => cancelResult(plan, i, v)),
      });
      return { claim, reported };
    };

    // --- happy path: unlink from the user's game, kept on a game they can't edit, mirror CANCELLED ---
    {
      const gMine = await mkGame('Cancel bk mine', booktime.id, P.owner);
      const gForeign = await mkGame('Cancel bk foreign', booktime.id, P.gameAdmin);
      const own = await geb(gMine, `bt-cb-own-${s}`, ClubIntegrationType.BOOKTIME, booktime.courts[0].id, P.owner.userId);
      await geb(gForeign, `bt-cb-own-${s}`, ClubIntegrationType.BOOKTIME, booktime.courts[0].id, P.owner.userId);

      const out = await call(P.owner, `geb:${own.id}`);
      assert.ok(out.action && out.plan && out.preview, 'proposes a client-executed action');
      const dto = toAgentPendingActionDto(out.action);
      assert.equal(dto.execution, 'client');
      assert.equal(dto.riskTier, 'critical');
      assert.equal(dto.canAlwaysAllow, false);
      assert.equal(out.plan.executor, 'client');
      assert.equal(out.plan.clientPlan.provider, 'BOOKTIME');
      assert.equal(out.plan.clientPlan.clubId, booktime.id);
      assert.equal(out.plan.clientPlan.operation, 'cancel');
      assert.deepEqual(out.plan.clientPlan.bookings.map((b) => b.externalBookingId), [`bt-cb-own-${s}`], 'provider id from the server row');
      assert.ok(!JSON.stringify(out.result.data).includes(`bt-cb-own-${s}`), 'no provider id to the model');
      assert.ok(!JSON.stringify(out.preview).includes(`bt-cb-own-${s}`), 'no provider id in the card');
      assert.ok(out.preview.title.includes(booktime.name), out.preview.title);
      assert.ok(out.preview.lines.some((l) => l.label === 'Courts' && l.from === 'Court 1'), 'courts line');
      assert.ok(out.preview.lines.some((l) => (l.from ?? '').includes('club time')), 'club-time line');
      assert.ok(out.preview.lines.some((l) => l.label === EN['field.unlinkFrom'] && (l.from ?? '').includes('Cancel bk mine')), 'unlink line');
      assert.ok(out.preview.lines.some((l) => l.label === EN['field.staysLinked'] && (l.from ?? '').includes('Cancel bk foreign')), 'stays-linked line');
      const warnings = out.preview.warnings ?? [];
      assert.ok(warnings.includes(EN['warn.cancelsAtClub']));
      assert.ok(warnings.includes(EN['warn.gamesKept']));
      assert.ok(warnings.includes('This booking is used by 2 games; all of them lose the court.'), 'shared note');
      assert.ok(warnings.some((w) => w.startsWith('It stays linked to 1 game')), 'stays-linked warning');

      const { claim, reported } = await runInApp(P.owner, out.action.id, [true]);
      assert.ok(claim.attemptId && reported, 'claimed and reported');
      assert.equal(reported.action.status, 'EXECUTED');
      const res = reported.action.result as AgentActionResult;
      assert.ok(res.message?.startsWith('Booking cancelled at the club and removed from 1 game'), res.message ?? '');
      assert.ok(res.message?.includes("still linked to 1 game(s) you can't edit"), res.message ?? '');
      assert.ok(!res.partial, 'not partial: the booking was cancelled');
      assert.equal(await prisma.gameExternalBooking.count({ where: { gameId: gMine } }), 0, 'unlinked from my game');
      assert.equal(await prisma.gameExternalBooking.count({ where: { gameId: gForeign } }), 1, "kept on the game I can't edit");
      assert.ok(await prisma.game.findUnique({ where: { id: gMine } }), 'game not deleted');
      const mirror = await prisma.externalBookingMirror.findFirst({ where: { userId: P.owner.userId, externalBookingId: `bt-cb-own-${s}` } });
      assert.equal(mirror?.state, ExternalBookingMirrorState.CANCELLED, 'mirror row CANCELLED');
      // Still visible through the game the owner plays in, but now CANCELLED and not cancellable.
      const after = await resolveBookingRef(P.owner, mirror ? `mirror:${mirror.id}` : 'x').catch(() => null);
      assert.ok(!after || (after.state === 'CANCELLED' && !after.canCancel), `after: ${after?.state}`);
      console.log('happy path (unlink + stays linked + mirror CANCELLED): ok');
    }

    // --- refusals ---
    {
      const g = await mkGame('Cancel bk refusals', booktime.id, P.owner);
      const other = await geb(g, `bt-cb-other-${s}`, ClubIntegrationType.BOOKTIME, booktime.courts[1].id, P.gameAdmin.userId);
      assert.equal(await classifyAgentOutcome(() => call(P.owner, `geb:${other.id}`)), 'forbidden', 'not the booker → 403');

      const mine = await geb(g, `bt-cb-mine-${s}`, ClubIntegrationType.BOOKTIME, booktime.courts[0].id, P.owner.userId);
      assert.equal(await classifyAgentOutcome(() => call(P.stranger, `geb:${mine.id}`)), 'not_found', "another user's ref → 404");
      assert.equal(await classifyAgentOutcome(() => call(P.owner, 'geb:does-not-exist')), 'not_found');

      const started = await geb(g, `bt-cb-started-${s}`, ClubIntegrationType.BOOKTIME, booktime.courts[0].id, P.owner.userId, -10 * 60 * 1000);
      assert.equal(await classifyAgentOutcome(() => call(P.owner, `geb:${started.id}`)), 'bad_request', 'started → 400');

      const gW = await mkGame('Cancel bk weltner', weltner.id, P.owner);
      const w = await geb(gW, `weltner-cb-${s}`, ClubIntegrationType.WELTNER, weltner.courts[0].id, P.owner.userId);
      const wOut = await call(P.owner, `geb:${w.id}`);
      assert.equal(wOut.action, null, 'Weltner: nothing proposed');
      const wData = wOut.result.data as { error: string; reason: string; message: string; clubPhone: string | null; handoffUrl: string };
      assert.equal(wData.reason, 'cancel_via_club');
      assert.equal(wData.clubPhone, '+381 11 555 0101');
      assert.ok(wData.message.includes('+381 11 555 0101'), wData.message);
      assert.ok(wOut.result.entities?.some((e) => e.type === 'handoff' && e.url === `/clubs/${weltner.id}`), 'club handoff');

      const gN = await mkGame('Cancel bk nspadel', nspadel.id, P.owner);
      const n = await geb(gN, `nspadel:cb-${s}`, ClubIntegrationType.NSPADELSUPABASE, nspadel.courts[0].id, P.owner.userId);
      const nOut = await call(P.owner, `geb:${n.id}`);
      assert.equal(nOut.action, null, 'Nspadel: nothing proposed');
      const nData = nOut.result.data as { reason: string; message: string; clubPhone: string | null };
      assert.equal(nData.reason, 'cancel_via_club');
      assert.equal(nData.clubPhone, null);
      assert.equal(nData.message, EN['refuse.cancelViaClub'].replace('{{club}}', nspadel.name));
      assert.ok(nOut.result.entities?.some((e) => e.type === 'handoff' && e.url === `/clubs/${nspadel.id}`));
      console.log('refusals (not booker, foreign 404, started, Weltner / Nspadel handoff): ok');
    }

    // --- claim re-checks the booker; no caps → still a card, /confirm 409; critical ---
    {
      const g = await mkGame('Cancel bk claim', booktime.id, P.owner);
      const b = await geb(g, `bt-cb-claim-${s}`, ClubIntegrationType.BOOKTIME, booktime.courts[0].id, P.owner.userId);
      const out = await call(P.owner, `geb:${b.id}`);
      assert.ok(out.action);
      await prisma.gameExternalBooking.update({ where: { id: b.id }, data: { bookedByUserId: P.gameAdmin.userId } });
      const { claim } = await runInApp(P.owner, out.action.id, [true]);
      assert.equal(claim.attemptId, null, 'booker changed → nothing reaches the app');
      assert.equal(claim.action.status, 'FAILED');
      assert.equal(await prisma.gameExternalBooking.count({ where: { id: b.id } }), 1, 'still linked');
      await prisma.gameExternalBooking.update({ where: { id: b.id }, data: { bookedByUserId: P.owner.userId } });

      const noCaps = await call(P.owner, `geb:${b.id}`, []);
      assert.ok(noCaps.action, 'no caps: still proposed (Telegram shows Open in app)');
      assert.ok((noCaps.result.data as { runsInApp?: string }).runsInApp, 'model told to send the user to the app');
      await expectApiError(actions.confirm(P.owner.userId, noCaps.action.id), 409, 'CLIENT_EXECUTION_REQUIRED');
      assert.equal(await autoApproveAgentAction(registry, noCaps.action.id, new Date()), null, 'never auto-approved');

      const permissions = new AgentToolPermissionService(() => registry);
      await assert.rejects(permissions.set(P.owner, 'cancel_booking', 'ALWAYS_ALLOW'), (e: { statusCode?: number }) => e.statusCode === 400);
      await prisma.agentPendingAction.updateMany({
        where: { chatId: { in: chatIds }, status: AgentActionStatus.PENDING },
        data: { status: AgentActionStatus.EXPIRED },
      });
      console.log('claim re-check, no caps 409, critical: ok');
    }

    console.log('agentCancelBooking.integration.test.ts: ok');
  } finally {
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error('chat cleanup failed', e));
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } }).catch((e) => console.error('game cleanup failed', e));
    await prisma.externalBookingMirror
      .deleteMany({ where: { clubId: { in: clubIds } } })
      .catch((e) => console.error('mirror cleanup failed', e));
    await prisma.club.deleteMany({ where: { id: { in: clubIds } } }).catch((e) => console.error('club cleanup failed', e));
    await fixture.cleanup().catch((e) => console.error('fixture cleanup failed', e));
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
