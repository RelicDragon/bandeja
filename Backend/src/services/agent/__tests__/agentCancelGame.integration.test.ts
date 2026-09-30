/**
 * Phase-7e `cancel_game` (real dev DB, no LLM, never the run queue):
 *   - actor × game matrix at propose time and at confirm time (`authorize` with a fresh
 *     principal): OWNER only, like `DELETE /games/:id` (parent owner and platform admin pass the
 *     HTTP rule too); hidden → 404; archived, results, child games → 400;
 *   - owner happy path: the game is deleted through `GameDeleteService` with the HTTP side effects
 *     (CancelledGame row + participant snapshot, chat THREAD_ARCHIVED), same as the HTTP delete
 *     of a twin game;
 *   - previews: participants notified, open bets / paid shares note, linked bookings "stay
 *     active", a shared booking called out (and still linked to the other game after the delete);
 *   - `cancelBookings: true` with linked bookings → refused with a `/games/:id` handoff, nothing
 *     proposed; without linked bookings → the game-only card;
 *   - critical tier: ALWAYS_ALLOW can't be stored, a forged ALWAYS_ALLOW row doesn't auto-approve;
 *   - confirm re-auth: ownership lost / results started after the proposal → refused;
 *   - strict input, `ru` preview.
 */
import assert from 'node:assert/strict';
import {
  AgentActionStatus,
  AgentRunStatus,
  AgentToolPermissionMode,
  ChatContextType,
  ChatSyncEventType,
  ClubIntegrationType,
  EntityType,
  ExternalBookingMirrorState,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  Sport,
} from '@prisma/client';
import type {
  AgentActionPreview,
  AgentActionResult,
  AgentClientPlan,
  AgentClientReportResult,
} from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { GameDeleteService } from '../../game/delete.service';
import {
  assertMatrixReport,
  classifyAgentOutcome,
  createAgentPermissionFixture,
  matrixRow,
  runAgentPermissionMatrix,
  type AgentMatrixExpectations,
} from '../access/__tests__/agentPermissionMatrix';
import { loadAgentPrincipal, type AgentPrincipal } from '../access/agentPrincipal';
import { autoApproveAgentAction } from '../agentActionAutoApprove';
import { createAgentChat } from '../agentChat.service';
import { AgentToolPermissionService } from '../agentToolPermission.service';
import { createAgentClientExecutionService } from '../clientExecution/clientExecution.service';
import { AGENT_CANCEL_GAME_I18N_EN } from '../i18n/agentCancelGameI18n';
import { AGENT_TOOL_DEFINITIONS } from '../tools';
import { AGENT_TOOL_AUTHZ_COVERAGE } from '../tools/__tests__/agentToolCoverage';
import { CANCEL_GAME_TOOLS } from '../tools/cancelGame.tools';
import { AgentToolRegistry, type AgentToolContext, type AgentToolDefinition } from '../tools/registry';

const ALL_TOOLS: AgentToolDefinition[] = [
  ...AGENT_TOOL_DEFINITIONS,
  ...(CANCEL_GAME_TOOLS as AgentToolDefinition[]).filter(
    (t) => !AGENT_TOOL_DEFINITIONS.some((registered) => registered.name === t.name),
  ),
];
const registry = new AgentToolRegistry(ALL_TOOLS);
const cancelGame = registry.get('cancel_game')!;
const HOUR = 60 * 60 * 1000;
const EN = AGENT_CANCEL_GAME_I18N_EN;

async function main(): Promise<void> {
  assert.ok(cancelGame, 'cancel_game registered');
  assert.equal(AGENT_TOOL_AUTHZ_COVERAGE.cancel_game, 'cancel-game-cases');
  assert.equal(cancelGame.riskTier, 'critical');

  const fixture = await createAgentPermissionFixture();
  const s = fixture.suffix;
  const P = fixture.principals;
  const G = fixture.games;
  const clubIds: string[] = [];
  const gameIds: string[] = [];
  const chatIds: string[] = [];
  try {
    const club = await prisma.club.create({
      data: {
        name: `Agent cancel club ${s}`,
        normalizedName: `agent cancel club ${s}`,
        address: 'Test street 1',
        cityId: fixture.cityId,
        courts: { create: [{ name: 'Court 1' }, { name: 'Court 2' }] },
      },
      include: { courts: { orderBy: { name: 'asc' } } },
    });
    clubIds.push(club.id);

    type Roster = [keyof typeof P, ParticipantRole, ParticipantStatus][];
    const OWNER_ONLY: Roster = [['owner', ParticipantRole.OWNER, ParticipantStatus.PLAYING]];
    const FULL: Roster = [
      ...OWNER_ONLY,
      ['gameAdmin', ParticipantRole.ADMIN, ParticipantStatus.PLAYING],
      ['player', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
      ['invited', ParticipantRole.PARTICIPANT, ParticipantStatus.INVITED],
    ];
    const mkGame = async (name: string, roster: Roster, extra: Record<string, unknown> = {}) => {
      const game = await prisma.game.create({
        data: {
          name: `${name} ${s}`,
          entityType: EntityType.GAME,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: fixture.cityId,
          clubId: club.id,
          startTime: new Date(Date.now() + 24 * HOUR),
          endTime: new Date(Date.now() + 25 * HOUR),
          timeIsSet: true,
          isPublic: true,
          participants: { create: roster.map(([actor, role, status]) => ({ userId: P[actor].userId, role, status })) },
          ...extra,
        },
        select: { id: true },
      });
      gameIds.push(game.id);
      return game.id;
    };

    let callSeq = 0;
    const hosts = new Map<string, { chatId: string; runId: string }>();
    const ctxFor = async (principal: AgentPrincipal, locale = 'en'): Promise<AgentToolContext> => {
      let host = hosts.get(principal.userId);
      if (!host) {
        const chat = await createAgentChat(principal.userId);
        chatIds.push(chat.id);
        const run = await prisma.agentRun.create({ data: { chatId: chat.id, userId: principal.userId, status: AgentRunStatus.COMPLETED } });
        host = { chatId: chat.id, runId: run.id };
        hosts.set(principal.userId, host);
      }
      callSeq += 1;
      return { principal, locale, timezone: 'UTC', now: new Date(), runId: host.runId, chatId: host.chatId, callId: `call_cg_${callSeq}` };
    };
    const expirePending = () =>
      prisma.agentPendingAction.updateMany({
        where: { chatId: { in: chatIds }, status: AgentActionStatus.PENDING },
        data: { status: AgentActionStatus.EXPIRED },
      });
    /** Handler call (validated input). Returns the proposal, or the non-proposing result. */
    const call = async (principal: AgentPrincipal, args: Record<string, unknown>, locale = 'en') => {
      try {
        const result = await cancelGame.handler(await ctxFor(principal, locale), cancelGame.input.parse(args));
        if (!result.awaitingConfirmation) return { result, action: null, plan: null, preview: null };
        const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: result.awaitingConfirmation.actionId } });
        return {
          result,
          action,
          plan: (action.args as { plan: unknown }).plan,
          preview: action.preview as unknown as AgentActionPreview,
        };
      } finally {
        await expirePending();
      }
    };
    const propose = async (principal: AgentPrincipal, gameId: string, locale = 'en') => {
      const out = await call(principal, { gameId, cancelBookings: false }, locale);
      assert.ok(out.action && out.preview, 'cancel_game proposes, never executes');
      return { ...out, action: out.action, preview: out.preview, plan: out.plan };
    };
    const authorize = async (principal: AgentPrincipal, plan: unknown) =>
      cancelGame.confirm!.authorize(await loadAgentPrincipal(principal.userId), plan);
    const confirm = async (principal: AgentPrincipal, plan: unknown) => {
      const fresh = await loadAgentPrincipal(principal.userId);
      await cancelGame.confirm!.authorize(fresh, plan);
      return cancelGame.confirm!.execute({ principal: fresh, locale: 'en', timezone: 'UTC', now: new Date() }, plan);
    };
    const planFor = (gameId: string) => ({ gameId, mode: 'game_only', externalBookingIds: [] });
    const warnings = (preview: AgentActionPreview) => preview.warnings ?? [];

    // --- actor × game matrix (propose, then confirm-time authorize) ---
    {
      // stranger invited queued player gameAdmin owner leagueOwner globalAdmin
      const EXPECT: AgentMatrixExpectations = {
        public: /*        */ matrixRow('F F F F F A F A'),
        private: /*       */ matrixRow('N F F F F A N A'),
        archived: /*      */ matrixRow('B B B B B B B B'),
        resultsLocked: /* */ matrixRow('F F F F F B F B'),
        pendingEvent: /*  */ matrixRow('N N N N N A N A'),
        privateSeason: /* */ matrixRow('F F F F F F B B'),
        leagueFixture: /* */ matrixRow('F F F F F A A A'),
      };
      assertMatrixReport(
        await runAgentPermissionMatrix({
          label: 'cancel_game propose',
          fixture,
          expectations: EXPECT,
          run: (principal, gameId) => call(principal, { gameId, cancelBookings: false }),
        }),
      );
      assertMatrixReport(
        await runAgentPermissionMatrix({
          label: 'cancel_game confirm',
          fixture,
          expectations: EXPECT,
          run: (principal, gameId) => authorize(principal, planFor(gameId)),
        }),
      );
      for (const id of Object.values(G)) {
        assert.ok(await prisma.game.findUnique({ where: { id }, select: { id: true } }), 'the matrix never deletes');
      }
      console.log('matrix: ok');
    }

    // --- owner happy path, HTTP parity, bets / shares note ---
    {
      const gA = await mkGame('Cancel happy', FULL);
      await prisma.bet.create({
        data: { gameId: gA, creatorId: P.player.userId, condition: { type: 'TEST' }, stakeCoins: 5, rewardCoins: 5 },
      });
      await prisma.gameCostShare.create({
        data: { gameId: gA, userId: P.player.userId, amountCents: 500, currency: 'EUR', markedPaidAt: new Date() },
      });
      assert.equal(await classifyAgentOutcome(() => propose(P.gameAdmin, gA)), 'forbidden', 'game admin (non-owner) refused');
      assert.equal(await classifyAgentOutcome(() => propose(P.player, gA)), 'forbidden', 'player refused');

      const { preview, plan, action, result } = await propose(P.owner, gA);
      assert.equal((action.args as { riskTier?: string }).riskTier, 'critical', 'stored as critical');
      assert.ok(preview.title.includes(`Cancel happy ${s}`), preview.title);
      const notified = preview.lines.find((l) => l.label === EN['field.notified']);
      assert.equal(notified?.to, '3', 'gameAdmin + player + invited are notified (not the owner)');
      assert.ok(preview.lines.some((l) => l.label === 'Club' && l.from === club.name), 'club line');
      assert.ok(warnings(preview).includes(EN['warn.deletes']));
      assert.ok(warnings(preview).includes('Open bets: 1, paid cost shares: 1. They will be refunded or cancelled.'), 'money note');
      assert.ok(!warnings(preview).some((w) => w.includes('reservations')), 'no booking note without bookings');
      assert.ok(result.entities?.some((e) => e.type === 'game'), 'game entity');

      const outcome = await confirm(P.owner, plan);
      assert.equal(outcome.message, EN['result.cancelled']);
      assert.equal(await prisma.game.findUnique({ where: { id: gA } }), null, 'game deleted');
      const cancelled = await prisma.cancelledGame.findUnique({ where: { id: gA }, include: { participants: true } });
      assert.ok(cancelled, 'CancelledGame row written');
      assert.equal(cancelled.cancelledByUserId, P.owner.userId);
      assert.equal(cancelled.participants.length, 4, 'participant snapshot');
      const archived = await prisma.chatSyncEvent.findFirst({
        where: { contextType: ChatContextType.GAME, contextId: gA, eventType: ChatSyncEventType.THREAD_ARCHIVED },
      });
      assert.ok(archived, 'chat archived');

      // Same as the HTTP delete (`DELETE /games/:id` → GameService.deleteGame → GameDeleteService).
      const gTwin = await mkGame('Cancel twin', FULL);
      await GameDeleteService.deleteGame(gTwin, P.owner.userId);
      const twin = await prisma.cancelledGame.findUnique({ where: { id: gTwin }, include: { participants: true } });
      assert.ok(twin);
      assert.deepEqual(
        { by: twin.cancelledByUserId, entityType: twin.entityType, participants: twin.participants.length },
        { by: cancelled.cancelledByUserId, entityType: cancelled.entityType, participants: cancelled.participants.length },
        'agent delete leaves the same trace as the HTTP delete',
      );
      console.log('happy path + HTTP parity: ok');
    }

    // --- results / child games ---
    {
      const gResults = await mkGame('Cancel results', OWNER_ONLY, { resultsStatus: 'FINAL' });
      assert.equal(await classifyAgentOutcome(() => propose(P.owner, gResults)), 'bad_request', 'results refused');
      const gParent = await mkGame('Cancel parent', OWNER_ONLY);
      await mkGame('Cancel child', OWNER_ONLY, { parentId: gParent });
      assert.equal(await classifyAgentOutcome(() => propose(P.owner, gParent)), 'bad_request', 'child games refused');
      console.log('results / child games: ok');
    }

    // --- linked bookings: stay active, shared booking, cancelBookings refusal ---
    {
      const [court1, court2] = club.courts;
      const gC = await mkGame('Cancel booked', FULL);
      const gOther = await mkGame('Cancel other', OWNER_ONLY);
      const start = new Date(Date.now() + 24 * HOUR);
      const end = new Date(start.getTime() + HOUR);
      const geb = (gameId: string, externalBookingId: string, courtId: string) =>
        prisma.gameExternalBooking.create({
          data: {
            gameId,
            externalBookingId,
            externalBookingProvider: ClubIntegrationType.BOOKTIME,
            courtId,
            bookingStart: start,
            bookingEnd: end,
            bookedByUserId: P.owner.userId,
          },
        });
      await geb(gC, `bt-cancel-own-${s}`, court1.id);
      await geb(gC, `bt-cancel-shared-${s}`, court2.id);
      const sharedOnOther = await geb(gOther, `bt-cancel-shared-${s}`, court2.id);

      // The club has no provider integration: nothing is cancellable here → nothing proposed.
      const refused = await call(P.owner, { gameId: gC, cancelBookings: true });
      assert.equal(refused.action, null, 'no cancellable linked booking → nothing proposed');
      const data = refused.result.data as { error: string; message: string; handoffUrl: string; linkedBookings: number; reasons: string[] };
      assert.equal(data.error, 'bookings_not_cancellable');
      assert.equal(data.message, EN['refuse.noneCancellable'].replace('{{count}}', '2'));
      assert.equal(data.linkedBookings, 2);
      assert.deepEqual([...data.reasons].sort(), ['clubOnly', 'shared']);
      assert.ok(
        refused.result.entities?.some((e) => e.type === 'handoff' && e.url === `/games/${gC}` && e.label === EN['handoff.openGame']),
        'handoff to the game page',
      );
      assert.ok(!JSON.stringify(refused.result.data).includes('bt-cancel'), 'no provider ids to the model');

      const { preview, plan } = await propose(P.owner, gC);
      assert.equal(preview.lines.filter((l) => l.label === EN['field.booking']).length, 2, 'both bookings listed');
      assert.ok(preview.lines.some((l) => l.label === EN['field.booking'] && (l.from ?? '').includes('Court 2')), 'court in the booking line');
      const reservations = warnings(preview).find((w) => w.startsWith('Only the game is cancelled'));
      assert.ok(reservations?.includes('(2)'), `reservations stay active note: ${reservations}`);
      const shared = warnings(preview).filter((w) => w.startsWith('The booking '));
      assert.equal(shared.length, 1, 'only the shared booking is called out');
      assert.ok(shared[0].includes('Court 2') && shared[0].includes('(1)'), shared[0]);
      assert.ok(!JSON.stringify(preview).includes('bt-cancel'), 'no provider ids in the card');

      const outcome = await confirm(P.owner, plan);
      assert.equal(outcome.message, EN['result.cancelledReservationsStay']);
      assert.equal(outcome.modelData?.reservationsAtClub, 'still active (not cancelled)');
      assert.equal(await prisma.game.findUnique({ where: { id: gC } }), null);
      assert.ok(await prisma.gameExternalBooking.findUnique({ where: { id: sharedOnOther.id } }), 'the other game keeps the shared booking');

      // cancelBookings=true without linked bookings: the game-only card.
      const gNoBookings = await mkGame('Cancel no bookings', OWNER_ONLY);
      const plain = await call(P.owner, { gameId: gNoBookings, cancelBookings: true });
      assert.ok(plain.action, 'no linked bookings → game-only proposal');
      assert.ok(!warnings(plain.preview!).some((w) => w.startsWith('Only the game is cancelled')));
      console.log('bookings: ok');
    }

    // --- cancelBookings: true → client-executed plan (slice 7g, owner decision #3) ---
    {
      const bt = await prisma.club.create({
        data: {
          name: `Agent cancel bt club ${s}`,
          normalizedName: `agent cancel bt club ${s}`,
          address: 'Test street 2',
          cityId: fixture.cityId,
          integrationType: ClubIntegrationType.BOOKTIME,
          courts: { create: [{ name: 'Court 1' }, { name: 'Court 2' }] },
        },
        include: { courts: { orderBy: { name: 'asc' } } },
      });
      clubIds.push(bt.id);
      const [c1, c2] = bt.courts;
      const mkBtGame = async (name: string) => {
        const id = await mkGame(name, FULL);
        await prisma.game.update({ where: { id }, data: { clubId: bt.id } });
        return id;
      };
      const geb = (gameId: string, externalBookingId: string, courtId: string, bookedByUserId: string) =>
        prisma.gameExternalBooking.create({
          data: {
            gameId,
            externalBookingId,
            externalBookingProvider: ClubIntegrationType.BOOKTIME,
            courtId,
            bookingStart: new Date(Date.now() + 24 * HOUR),
            bookingEnd: new Date(Date.now() + 25 * HOUR),
            bookedByUserId,
          },
        });
      const followUps: string[] = [];
      const runService = { enqueueFollowUpRun: async () => `follow-up-${followUps.push('x')}` };
      const service = createAgentClientExecutionService({ registry: () => registry, runService: () => runService });
      const proposeWith = async (gameId: string) => {
        const ctx = { ...(await ctxFor(P.owner)), clientCaps: ['booking-v1'] };
        const result = await cancelGame.handler(ctx, cancelGame.input.parse({ gameId, cancelBookings: true }));
        assert.ok(result.awaitingConfirmation, JSON.stringify(result.data));
        const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: result.awaitingConfirmation.actionId } });
        return { result, action, preview: action.preview as unknown as AgentActionPreview };
      };
      const claim = async (actionId: string) => {
        const claimed = await service.claim(P.owner.userId, actionId, `key-${actionId}`);
        assert.ok(claimed.attemptId && claimed.clientPlan, 'claimed');
        return { attemptId: claimed.attemptId, plan: claimed.clientPlan };
      };
      const results = (plan: AgentClientPlan, ok: boolean[]): AgentClientReportResult[] =>
        ok.map((v, i) => ({
          provider: plan.provider,
          courtId: plan.bookings[i].courtId,
          date: plan.date,
          start: plan.start,
          durationMinutes: plan.durationMinutes,
          ok: v,
          externalBookingId: plan.bookings[i].externalBookingId,
          bookingRef: plan.bookings[i].bookingRef,
          error: v ? null : 'provider_error',
        }));
      const report = async (actionId: string, attemptId: string, plan: AgentClientPlan, ok: boolean[]) => {
        const out = await service.report(P.owner.userId, actionId, { attemptId, results: results(plan, ok) });
        return { status: out.action.status, result: out.action.result as AgentActionResult };
      };

      // (a) every planned booking cancelled → game deleted; shared + someone else's booking stay.
      const gAll = await mkBtGame('Cancel bt all');
      const gShare = await mkBtGame('Cancel bt share');
      await geb(gAll, `bt-all-1-${s}`, c1.id, P.owner.userId);
      await geb(gAll, `bt-all-2-${s}`, c2.id, P.owner.userId);
      await geb(gAll, `bt-all-shared-${s}`, c1.id, P.owner.userId);
      const sharedOther = await geb(gShare, `bt-all-shared-${s}`, c1.id, P.owner.userId);
      await geb(gAll, `bt-all-theirs-${s}`, c2.id, P.gameAdmin.userId);
      {
        const { action, preview, result } = await proposeWith(gAll);
        assert.equal((action.args as { riskTier?: string }).riskTier, 'critical');
        assert.ok(preview.title.startsWith('Cancel ') && preview.title.endsWith('and its court bookings'), preview.title);
        assert.equal(preview.lines.filter((l) => l.label === EN['field.bookingCancel']).length, 2, 'two to cancel');
        const stays = preview.lines.filter((l) => l.label === EN['field.bookingStays']).map((l) => l.from ?? '');
        assert.equal(stays.length, 2, 'shared + not mine stay active');
        assert.ok(stays.some((l) => l.endsWith(`(${EN['reason.shared']})`)), stays.join(' | '));
        assert.ok(stays.some((l) => l.endsWith(`(${EN['reason.notBooker']})`)), stays.join(' | '));
        assert.ok((preview.warnings ?? []).includes(EN['warn.bookingsFirst']));
        assert.ok((preview.warnings ?? []).some((w) => w.startsWith('The booking ') && w.includes('(1)')), 'shared booking called out');
        assert.ok(!JSON.stringify(result.data).includes('bt-all'), 'no provider ids to the model');
        const { attemptId, plan } = await claim(action.id);
        assert.deepEqual(plan.bookings.map((b) => b.externalBookingId).sort(), [`bt-all-1-${s}`, `bt-all-2-${s}`], 'plan = my non-shared bookings');
        assert.equal(plan.postStep.kind, 'delete_game');
        const out = await report(action.id, attemptId, plan, [true, true]);
        assert.equal(out.status, 'EXECUTED');
        assert.ok(!out.result.partial, 'not partial');
        assert.ok(out.result.message?.startsWith('Game cancelled and reservations cancelled at the club: 2.'), out.result.message ?? '');
        assert.ok(out.result.message?.includes('Still active at the club:'), 'names what stays active');
        assert.equal(await prisma.game.findUnique({ where: { id: gAll } }), null, 'game deleted');
        assert.ok(await prisma.cancelledGame.findUnique({ where: { id: gAll } }), 'CancelledGame row');
        assert.ok(await prisma.gameExternalBooking.findUnique({ where: { id: sharedOther.id } }), 'shared booking untouched on the other game');
        const mirrors = await prisma.externalBookingMirror.findMany({ where: { userId: P.owner.userId, clubId: bt.id } });
        assert.deepEqual(
          mirrors.filter((m) => m.state === ExternalBookingMirrorState.CANCELLED).map((m) => m.externalBookingId).sort(),
          [`bt-all-1-${s}`, `bt-all-2-${s}`],
          'mirror rows CANCELLED',
        );
      }

      // (b) one cancel failed → game kept, the cancelled one unlinked, partial names the active one.
      const gPart = await mkBtGame('Cancel bt partial');
      const p1 = await geb(gPart, `bt-part-1-${s}`, c1.id, P.owner.userId);
      const p2 = await geb(gPart, `bt-part-2-${s}`, c2.id, P.owner.userId);
      {
        const { action } = await proposeWith(gPart);
        const { attemptId, plan } = await claim(action.id);
        const ok = plan.bookings.map((b) => b.externalBookingId === p1.externalBookingId);
        const out = await report(action.id, attemptId, plan, ok);
        assert.equal(out.status, 'EXECUTED');
        assert.equal(out.result.partial, true);
        assert.ok(out.result.message?.startsWith('Cancelled 1 of 2 reservations. The game was kept'), out.result.message ?? '');
        assert.ok(out.result.message?.includes('Court 2'), 'names the still-active booking');
        assert.ok(await prisma.game.findUnique({ where: { id: gPart } }), 'game kept');
        assert.equal(await prisma.gameExternalBooking.findUnique({ where: { id: p1.id } }), null, 'cancelled one unlinked');
        assert.ok(await prisma.gameExternalBooking.findUnique({ where: { id: p2.id } }), 'active one still linked');
      }

      // (c) bookings cancelled, then the delete is refused (results started) → partial "game still exists".
      const gDel = await mkBtGame('Cancel bt delete fails');
      const d1 = await geb(gDel, `bt-del-1-${s}`, c1.id, P.owner.userId);
      {
        const { action } = await proposeWith(gDel);
        const { attemptId, plan } = await claim(action.id);
        await prisma.game.update({ where: { id: gDel }, data: { resultsStatus: 'IN_PROGRESS' } });
        const out = await report(action.id, attemptId, plan, [true]);
        assert.equal(out.status, 'EXECUTED');
        assert.equal(out.result.partial, true);
        assert.equal(out.result.message, EN['result.deleteFailed'].replace('{{count}}', '1'));
        assert.ok(await prisma.game.findUnique({ where: { id: gDel } }), 'game still exists');
        assert.equal(await prisma.gameExternalBooking.findUnique({ where: { id: d1.id } }), null, 'cancelled booking unlinked');
      }

      // (d) ownership lost before the report → no delete, partial.
      const gLost = await mkBtGame('Cancel bt lost');
      await geb(gLost, `bt-lost-1-${s}`, c1.id, P.owner.userId);
      {
        const { action } = await proposeWith(gLost);
        const { attemptId, plan } = await claim(action.id);
        await prisma.gameParticipant.updateMany({ where: { gameId: gLost, userId: P.owner.userId }, data: { role: ParticipantRole.PARTICIPANT } });
        await prisma.gameParticipant.updateMany({ where: { gameId: gLost, userId: P.gameAdmin.userId }, data: { role: ParticipantRole.OWNER } });
        const out = await report(action.id, attemptId, plan, [true]);
        assert.equal(out.status, 'EXECUTED');
        assert.equal(out.result.partial, true);
        assert.equal(out.result.message, EN['result.deleteFailed'].replace('{{count}}', '1'));
        assert.ok(await prisma.game.findUnique({ where: { id: gLost } }), 'not deleted');
      }

      // (e) every cancel failed → FAILED, nothing changes.
      const gNone = await mkBtGame('Cancel bt none');
      await geb(gNone, `bt-none-1-${s}`, c1.id, P.owner.userId);
      {
        const { action } = await proposeWith(gNone);
        const { attemptId, plan } = await claim(action.id);
        const out = await report(action.id, attemptId, plan, [false]);
        assert.equal(out.status, 'FAILED');
        assert.ok(await prisma.game.findUnique({ where: { id: gNone } }), 'game kept');
        assert.equal(await prisma.gameExternalBooking.count({ where: { gameId: gNone } }), 1, 'still linked');
      }
      await prisma.externalBookingMirror.deleteMany({ where: { clubId: bt.id } });
      console.log('cancelBookings client plan (all / partial / delete fails / ownership lost / all failed): ok');
    }

    // --- critical tier: never always-allowed ---
    {
      const gD = await mkGame('Cancel critical', OWNER_ONLY);
      const permissions = new AgentToolPermissionService(() => registry);
      await assert.rejects(permissions.set(P.owner, 'cancel_game', 'ALWAYS_ALLOW'), (e: { statusCode?: number }) => e.statusCode === 400);
      // A forged ALWAYS_ALLOW row (e.g. written before the tool was critical) still asks.
      await prisma.agentToolPermission.create({
        data: { userId: P.owner.userId, toolName: 'cancel_game', mode: AgentToolPermissionMode.ALWAYS_ALLOW },
      });
      try {
        const ctx = await ctxFor(P.owner);
        const executed = await registry.executeTool(ctx, 'cancel_game', { gameId: gD, cancelBookings: false });
        assert.ok(executed.ok && executed.awaitingConfirmation, JSON.stringify(executed.data));
        const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: executed.awaitingConfirmation.actionId } });
        assert.equal((action.args as { riskTier?: string }).riskTier, 'critical');
        assert.equal(await autoApproveAgentAction(registry, action.id, new Date()), null, 'critical is never auto-approved');
        assert.equal((await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: action.id } })).status, AgentActionStatus.PENDING);
        assert.ok(await prisma.game.findUnique({ where: { id: gD } }), 'game still exists');
      } finally {
        await prisma.agentToolPermission.deleteMany({ where: { userId: P.owner.userId, toolName: 'cancel_game' } });
        await expirePending();
      }
      console.log('critical tier: ok');
    }

    // --- confirm re-authorizes with a fresh principal ---
    {
      const gE = await mkGame('Cancel lost', FULL);
      const { plan } = await propose(P.owner, gE);
      await prisma.gameParticipant.updateMany({ where: { gameId: gE, userId: P.owner.userId }, data: { role: ParticipantRole.PARTICIPANT } });
      await prisma.gameParticipant.updateMany({ where: { gameId: gE, userId: P.gameAdmin.userId }, data: { role: ParticipantRole.OWNER } });
      assert.equal(await classifyAgentOutcome(() => authorize(P.owner, plan)), 'forbidden', 'ownership lost → refused at confirm');
      assert.ok(await prisma.game.findUnique({ where: { id: gE } }), 'not deleted');

      const gF = await mkGame('Cancel results later', OWNER_ONLY);
      const later = await propose(P.owner, gF);
      await prisma.game.update({ where: { id: gF }, data: { resultsStatus: 'IN_PROGRESS' } });
      assert.equal(await classifyAgentOutcome(() => authorize(P.owner, later.plan)), 'bad_request', 'results started → refused at confirm');

      const gH = await mkGame('Cancel hidden later', OWNER_ONLY, { isPublic: false });
      const hidden = await propose(P.owner, gH);
      await prisma.gameParticipant.deleteMany({ where: { gameId: gH, userId: P.owner.userId } });
      await prisma.gameParticipant.create({ data: { gameId: gH, userId: P.gameAdmin.userId, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING } });
      assert.equal(await classifyAgentOutcome(() => authorize(P.owner, hidden.plan)), 'not_found', 'no longer visible → 404');
      console.log('confirm re-auth: ok');
    }

    // --- strict input, locale ---
    {
      assert.equal(cancelGame.input.safeParse({ gameId: 'x' }).success, false, 'cancelBookings is required');
      assert.equal(cancelGame.input.safeParse({ gameId: 'x', cancelBookings: false, userId: 'y' }).success, false, 'unknown keys rejected');
      const gR = await mkGame('Cancel ru', OWNER_ONLY);
      const ru = await propose(P.owner, gR, 'ru');
      assert.ok(ru.preview.title.startsWith('Отменить'), ru.preview.title);
      console.log('input + locale: ok');
    }

    console.log('agentCancelGame.integration.test.ts: ok');
  } finally {
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error('chat cleanup failed', e));
    for (const id of [...gameIds].reverse()) {
      await prisma.game.deleteMany({ where: { id } }).catch((e) => console.error('game cleanup failed', e));
    }
    await prisma.cancelledGame.deleteMany({ where: { id: { in: gameIds } } }).catch((e) => console.error('cancelled cleanup failed', e));
    await prisma.chatSyncEvent
      .deleteMany({ where: { contextType: ChatContextType.GAME, contextId: { in: gameIds } } })
      .catch((e) => console.error('chat event cleanup failed', e));
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
