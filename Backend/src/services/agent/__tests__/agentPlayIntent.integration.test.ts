/**
 * Slice 9a play-intent tools (real dev DB + in-process HTTP app, no LLM, never the run queue):
 *   - strict input on all four tools (unknown keys / actor ids rejected);
 *   - create / replace / cancel parity with `POST /play-intents` / `DELETE /play-intents/:id`
 *     (same stored rows; old intent CANCELLED on replace), previews (what's created / replaced /
 *     cancelled, `ru`);
 *   - home city only: another `cityId` refused, a home-city change before confirm refused;
 *   - matches: a public game with a private parent is on the HTTP radar but never in the agent's
 *     matches; private games never; `get_my_play_intent` counts only visible ones;
 *   - confirm re-auth with a fresh principal (intent cancelled in between → 404, deactivated user);
 *   - standard tier.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import {
  AgentActionStatus,
  AgentRunStatus,
  EntityType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  PlayIntentStatus,
  Sport,
} from '@prisma/client';
import type { AgentActionPreview } from '@bandeja/shared/agentContract';
import app from '../../../app';
import prisma from '../../../config/database';
import { generateShortAccessToken } from '../../../utils/jwt';
import { PlayIntentFollowerNotificationQueueService } from '../../playIntent/playIntentFollowerNotificationQueue.service';
import { PlayIntentMatchQueueService } from '../../playIntent/playIntentMatchQueue.service';
import { PlayIntentMatchService } from '../../playIntent/playIntentMatch.service';
import { classifyAgentOutcome } from '../access/__tests__/agentPermissionMatrix';
import { loadAgentPrincipal, type AgentPrincipal } from '../access/agentPrincipal';
import { createAgentChat } from '../agentChat.service';
import { AGENT_PLAY_INTENT_I18N_EN, AGENT_PLAY_INTENT_I18N_TRANSLATIONS } from '../i18n/agentPlayIntentI18n';
import { AGENT_TOOL_DEFINITIONS } from '../tools';
import { AGENT_TOOL_AUTHZ_COVERAGE } from '../tools/__tests__/agentToolCoverage';
import { AgentToolRegistry, type AgentToolContext } from '../tools/registry';

const registry = new AgentToolRegistry(AGENT_TOOL_DEFINITIONS);
const tool = (name: string) => {
  const definition = registry.get(name);
  assert.ok(definition, `${name} registered`);
  return definition;
};
const EN = AGENT_PLAY_INTENT_I18N_EN;
const DAY = 24 * 60 * 60 * 1000;
const INTENT_FIELDS = [
  'sport',
  'entityType',
  'dateKeys',
  'timeOfDay',
  'timeOfDays',
  'startTime',
  'endTime',
  'clubIds',
  'minLevel',
  'maxLevel',
  'genderTeams',
  'status',
  'expiresAt',
  'cityId',
] as const;

async function main(): Promise<void> {
  const originalSocketService = (global as { socketService?: unknown }).socketService;
  const originalMatchDrain = PlayIntentMatchQueueService.drain;
  const originalFollowerDrain = PlayIntentFollowerNotificationQueueService.drain;
  (global as { socketService?: unknown }).socketService = new Proxy({}, { get: () => () => undefined });
  PlayIntentMatchQueueService.drain = async () => undefined;
  PlayIntentFollowerNotificationQueueService.drain = async () => undefined;

  for (const name of ['get_my_play_intent', 'list_play_intent_matches']) {
    assert.equal(tool(name).kind, 'read');
    assert.equal(AGENT_TOOL_AUTHZ_COVERAGE[name], 'play-intent-read-cases');
  }
  for (const name of ['set_play_intent', 'cancel_play_intent']) {
    assert.equal(tool(name).kind, 'write');
    assert.equal(tool(name).riskTier, 'standard', `${name} is standard`);
    assert.equal(AGENT_TOOL_AUTHZ_COVERAGE[name], 'play-intent-write-cases');
  }

  const s = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const home = await prisma.city.create({ data: { name: `Agent intent home ${s}`, country: 'Test', timezone: 'UTC' } });
  const other = await prisma.city.create({ data: { name: `Agent intent other ${s}`, country: 'Test', timezone: 'UTC' } });
  const userIds: string[] = [];
  const gameIds: string[] = [];
  const chatIds: string[] = [];
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    const mkUser = async (name: string) => {
      const user = await prisma.user.create({
        data: { phone: `qa-agent-intent-${name}-${s}`, firstName: name, currentCityId: home.id, primarySport: Sport.PADEL, lastUserIP: '::ffff:127.0.0.1' },
      });
      userIds.push(user.id);
      return loadAgentPrincipal(user.id);
    };
    const A = await mkUser('agent');
    const B = await mkUser('http');
    const owner = await mkUser('owner');
    const club = await prisma.club.create({
      data: { name: `Agent intent club ${s}`, normalizedName: `agent intent club ${s}`, address: 'x', cityId: home.id },
    });
    const otherClub = await prisma.club.create({
      data: { name: `Agent intent other club ${s}`, normalizedName: `agent intent other club ${s}`, address: 'x', cityId: other.id },
    });

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
      return { principal, locale, timezone: 'UTC', now: new Date(), runId: host.runId, chatId: host.chatId, callId: `call_pi_${callSeq}` };
    };
    const expirePending = () =>
      prisma.agentPendingAction.updateMany({
        where: { chatId: { in: chatIds }, status: AgentActionStatus.PENDING },
        data: { status: AgentActionStatus.EXPIRED },
      });
    /** Through `executeTool` (strict parse + error mapping), like the run loop. */
    const exec = async (principal: AgentPrincipal, name: string, args: unknown, locale = 'en') => {
      const ctx = await ctxFor(principal, locale);
      try {
        return await registry.executeTool(ctx, name, args);
      } finally {
        await expirePending();
      }
    };
    const propose = async (principal: AgentPrincipal, name: string, args: unknown, locale = 'en') => {
      const out = await exec(principal, name, args, locale);
      assert.ok(out.ok && out.awaitingConfirmation, `${name} proposes: ${JSON.stringify(out.data)}`);
      const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: out.awaitingConfirmation.actionId } });
      return { plan: (action.args as { plan: unknown }).plan, preview: action.preview as unknown as AgentActionPreview };
    };
    const confirm = async (principal: AgentPrincipal, name: string, plan: unknown) => {
      const fresh = await loadAgentPrincipal(principal.userId);
      await tool(name).confirm!.authorize(fresh, plan);
      return tool(name).confirm!.execute({ principal: fresh, locale: 'en', timezone: 'UTC', now: new Date() }, plan);
    };
    const http = async (userId: string, method: string, path: string, body?: unknown) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/play-intents${path}`, {
        method,
        headers: { Authorization: `Bearer ${generateShortAccessToken({ userId })}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const json = (await res.json()) as { data?: { id?: string } };
      return { status: res.status, data: json.data };
    };
    const activeOf = (userId: string) =>
      prisma.playIntent.findFirst({
        where: { userId, status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] } },
        orderBy: { createdAt: 'desc' },
      });
    const assertSameIntent = async (agentUser: string, httpUser: string, label: string) => {
      const [a, b] = await Promise.all([activeOf(agentUser), activeOf(httpUser)]);
      assert.ok(a && b, `${label}: both have an active intent`);
      for (const field of INTENT_FIELDS) {
        assert.deepEqual(a[field], b[field], `${label}: ${field} matches HTTP`);
      }
      return { a, b };
    };
    const lineTo = (preview: AgentActionPreview, label: string) => preview.lines.find((l) => l.label === label);

    // --- strict input -------------------------------------------------------------------------
    {
      for (const name of ['get_my_play_intent', 'list_play_intent_matches', 'set_play_intent', 'cancel_play_intent']) {
        for (const extra of [{ userId: B.userId }, { foo: 1 }]) {
          const out = await exec(A, name, extra);
          assert.equal(out.ok, false, `${name} rejects ${Object.keys(extra)[0]}`);
          assert.equal((out.data as { error: string }).error, 'invalid_arguments');
        }
      }
      for (const bad of [
        { timeOfDays: ['CUSTOM'], startTime: '19:00' }, // HTTP schema: CUSTOM needs both times
        { timeOfDays: ['ANYTIME', 'EVENING'] }, // HTTP schema: ANYTIME goes alone
        { dayOffsets: [0], dateKeys: ['2031-01-01'] }, // HTTP schema: not both
        { startTime: '7pm' },
        { dayOffsets: [3] },
      ]) {
        const out = await exec(A, 'set_play_intent', bad);
        assert.equal(out.ok, false, `set_play_intent refuses ${JSON.stringify(bad)}`);
        assert.equal(await prisma.agentPendingAction.count({ where: { chatId: { in: chatIds }, toolName: 'set_play_intent' } }), 0);
      }
      console.log('strict input: ok');
    }

    // --- home city only -----------------------------------------------------------------------
    {
      const out = await exec(A, 'set_play_intent', { cityId: other.id, dayOffsets: [1] });
      assert.equal(out.ok, false, 'other city refused');
      assert.equal((out.data as { error: string }).error, 'bad_request');
      assert.match((out.data as { message: string }).message, /home city/);
      const club404 = await exec(A, 'set_play_intent', { dayOffsets: [1], clubIds: [otherClub.id] });
      assert.equal((club404.data as { error: string }).error, 'not_found', "another city's club is refused");
      const cancelNone = await exec(A, 'cancel_play_intent', {});
      assert.equal((cancelNone.data as { error: string }).error, 'bad_request', 'nothing to cancel');
      const none = await exec(A, 'get_my_play_intent', {});
      assert.equal((none.data as { intent: unknown }).intent, null);
      const noMatches = await exec(A, 'list_play_intent_matches', {});
      assert.deepEqual((noMatches.data as { games: unknown[] }).games, []);
      assert.equal(await activeOf(A.userId), null, 'nothing created');
      console.log('home city: ok');
    }

    // --- create parity ------------------------------------------------------------------------
    const createArgs = { sport: Sport.PADEL, dayOffsets: [1], timeOfDays: ['CUSTOM'], startTime: '19:00', endTime: '24:00', clubIds: [club.id], minLevel: 2, maxLevel: 4 };
    {
      const { plan, preview } = await propose(A, 'set_play_intent', createArgs);
      assert.equal(await activeOf(A.userId), null, 'propose never writes');
      assert.equal(lineTo(preview, 'City')?.to, home.name);
      assert.equal(lineTo(preview, 'Days')?.to, EN['value.tomorrow']);
      assert.equal(lineTo(preview, 'Time')?.to, '19:00–24:00');
      assert.equal(lineTo(preview, 'Clubs')?.to, club.name);
      assert.equal(lineTo(preview, 'Days')?.from, null, 'nothing replaced');
      assert.ok(preview.warnings?.includes(EN['warn.followersNotified']));
      assert.ok(!preview.warnings?.includes(EN['warn.replaces']));
      const outcome = await confirm(A, 'set_play_intent', plan);
      assert.equal(outcome.message, EN['result.set']);
      const res = await http(B.userId, 'POST', '', createArgs);
      assert.equal(res.status, 201, 'HTTP create');
      const { a } = await assertSameIntent(A.userId, B.userId, 'create');
      assert.equal(a.status, PlayIntentStatus.OPEN);
      assert.equal(a.cityId, home.id);
      assert.equal(await prisma.playIntentFollowerNotificationJob.count({ where: { intentId: a.id } }), 1, 'same follower job as HTTP');

      // Same request again → the service keeps the intent (no-op).
      const again = await propose(A, 'set_play_intent', createArgs);
      const same = await confirm(A, 'set_play_intent', again.plan);
      assert.equal(same.message, EN['result.unchanged']);
      assert.equal((await activeOf(A.userId))?.id, a.id);

      // get_my_play_intent
      const mine = await exec(A, 'get_my_play_intent', {});
      const data = mine.data as { intent: { intentId: string; status: string; labels: { time: string } }; proposal: unknown };
      assert.equal(data.intent.intentId, a.id);
      assert.equal(data.intent.status, 'OPEN');
      assert.equal(data.intent.labels.time, '19:00–24:00');
      assert.equal(data.proposal, null);
      console.log('create parity: ok');
    }

    // --- replace parity -----------------------------------------------------------------------
    {
      const replaceArgs = { sport: Sport.PADEL, dayOffsets: [2], timeOfDays: ['MORNING', 'EVENING'], genderTeams: 'ANY' };
      const oldA = (await activeOf(A.userId))!;
      const oldB = (await activeOf(B.userId))!;
      const { plan, preview } = await propose(A, 'set_play_intent', replaceArgs);
      assert.ok(preview.warnings?.includes(EN['warn.replaces']), 'card says it replaces');
      assert.ok(!preview.warnings?.includes(EN['warn.followersNotified']), 'no follower ping on a replace');
      assert.equal(lineTo(preview, 'Time')?.from, '19:00–24:00');
      assert.equal(lineTo(preview, 'Time')?.to, `${EN['value.morning']}, ${EN['value.evening']}`);
      assert.equal(lineTo(preview, 'Clubs')?.from, club.name);
      assert.equal(lineTo(preview, 'Clubs')?.to, EN['value.anyClub']);
      const outcome = await confirm(A, 'set_play_intent', plan);
      assert.equal((outcome.modelData as { replacedIntentId: string }).replacedIntentId, oldA.id);
      assert.equal((await http(B.userId, 'POST', '', replaceArgs)).status, 201);
      await assertSameIntent(A.userId, B.userId, 'replace');
      for (const old of [oldA, oldB]) {
        assert.equal((await prisma.playIntent.findUniqueOrThrow({ where: { id: old.id } })).status, PlayIntentStatus.CANCELLED, 'old intent cancelled');
      }
      assert.equal(await prisma.playIntent.count({ where: { userId: A.userId, status: PlayIntentStatus.OPEN } }), 1, 'one OPEN per user + city');

      // ru preview
      const ru = await propose(A, 'set_play_intent', { ...replaceArgs, entityType: 'BAR' }, 'ru');
      assert.equal(ru.preview.title, AGENT_PLAY_INTENT_I18N_TRANSLATIONS.ru['preview.setTitleBar']);
      assert.ok(!lineTo(ru.preview, 'Level'), 'BAR has no level line');
      console.log('replace parity: ok');
    }

    // --- set confirm re-auth ------------------------------------------------------------------
    {
      const { plan } = await propose(A, 'set_play_intent', { dayOffsets: [1] });
      await prisma.user.update({ where: { id: A.userId }, data: { currentCityId: other.id } });
      assert.equal(await classifyAgentOutcome(() => confirm(A, 'set_play_intent', plan)), 'bad_request', 'home city changed before confirm');
      await prisma.user.update({ where: { id: A.userId }, data: { currentCityId: home.id, isActive: false } });
      await assert.rejects(() => confirm(A, 'set_play_intent', plan), 'deactivated user');
      await prisma.user.update({ where: { id: A.userId }, data: { isActive: true } });
      const current = (await activeOf(A.userId))!;
      assert.deepEqual(current.timeOfDays, ['MORNING', 'EVENING'], 'nothing written by refused confirms');
      console.log('set re-auth: ok');
    }

    // --- matches: only games the agent may see ------------------------------------------------
    {
      const tomorrow18 = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) + DAY + 18 * 60 * 60 * 1000);
      const mkGame = async (name: string, extra: Record<string, unknown>) => {
        const game = await prisma.game.create({
          data: {
            name: `${name} ${s}`,
            entityType: EntityType.GAME,
            sport: Sport.PADEL,
            gameType: GameType.CLASSIC,
            cityId: home.id,
            clubId: club.id,
            startTime: tomorrow18,
            endTime: new Date(tomorrow18.getTime() + 90 * 60 * 1000),
            timeIsSet: true,
            isPublic: true,
            maxParticipants: 4,
            participants: { create: [{ userId: owner.userId, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING }] },
            ...extra,
          },
          select: { id: true },
        });
        gameIds.push(game.id);
        return game.id;
      };
      const visible = await mkGame('Radar visible', {});
      const privateParent = await mkGame('Radar private parent', { isPublic: false });
      const hiddenChild = await mkGame('Radar hidden child', { parentId: privateParent });

      await confirm(A, 'set_play_intent', (await propose(A, 'set_play_intent', { sport: Sport.PADEL, dayOffsets: [1] })).plan);
      const pool = await PlayIntentMatchService.getPoolForViewer(A.userId, home.id, Sport.PADEL);
      const radarIds = pool.matchingGames.map((g) => g.id);
      assert.ok(radarIds.includes(visible), 'HTTP radar has the public game');
      assert.ok(radarIds.includes(hiddenChild), 'HTTP radar has the public child of a private parent (the filter matters)');
      assert.ok(!radarIds.includes(privateParent), 'private game never on the radar');

      const out = await exec(A, 'list_play_intent_matches', {});
      assert.ok(out.ok);
      const ids = (out.data as { games: Array<{ gameId: string; allowDirectJoin: boolean }> }).games.map((g) => g.gameId);
      assert.ok(ids.includes(visible), 'agent lists the visible game');
      assert.ok(!ids.includes(hiddenChild), 'agent never lists a game it may not see');
      assert.ok(!ids.includes(privateParent));
      assert.ok(!JSON.stringify(out.entities ?? []).includes(hiddenChild), 'no hidden entity');
      const mine = await exec(A, 'get_my_play_intent', {});
      assert.equal((mine.data as { matchingGameCount: number }).matchingGameCount, ids.length);
      assert.ok(!JSON.stringify(mine.data).includes(hiddenChild));
      console.log('matches visibility: ok');
    }

    // --- cancel parity + re-auth --------------------------------------------------------------
    {
      const target = (await activeOf(A.userId))!;
      const { plan, preview } = await propose(A, 'cancel_play_intent', {});
      assert.equal(preview.title, EN['preview.cancelTitle']);
      assert.equal(lineTo(preview, 'Play request')?.to, EN['value.cancelled']);
      assert.equal((await activeOf(A.userId))?.id, target.id, 'propose never cancels');
      const outcome = await confirm(A, 'cancel_play_intent', plan);
      assert.equal(outcome.message, EN['result.cancelled']);
      assert.equal((await prisma.playIntent.findUniqueOrThrow({ where: { id: target.id } })).status, PlayIntentStatus.CANCELLED);

      const httpTarget = (await activeOf(B.userId))!;
      const res = await http(B.userId, 'DELETE', `/${httpTarget.id}`);
      assert.equal(res.status, 200, 'HTTP cancel');
      assert.equal((await prisma.playIntent.findUniqueOrThrow({ where: { id: httpTarget.id } })).status, PlayIntentStatus.CANCELLED, 'same end state as HTTP');

      // Cancelled elsewhere between the card and the tap → 404 at confirm, nothing else touched.
      await confirm(A, 'set_play_intent', (await propose(A, 'set_play_intent', { dayOffsets: [1] })).plan);
      const again = await propose(A, 'cancel_play_intent', {});
      const live = (await activeOf(A.userId))!;
      assert.equal((await http(A.userId, 'DELETE', `/${live.id}`)).status, 200);
      assert.equal(await classifyAgentOutcome(() => confirm(A, 'cancel_play_intent', again.plan)), 'not_found', 'already cancelled');
      // A forged plan with someone else's intent → 404.
      await http(B.userId, 'POST', '', { dayOffsets: [1] });
      const foreign = (await activeOf(B.userId))!;
      assert.equal(await classifyAgentOutcome(() => confirm(A, 'cancel_play_intent', { intentId: foreign.id })), 'not_found', 'foreign intent');
      assert.equal((await activeOf(B.userId))?.id, foreign.id, "the other user's intent is untouched");
      console.log('cancel parity + re-auth: ok');
    }
  } finally {
    PlayIntentMatchQueueService.drain = originalMatchDrain;
    PlayIntentFollowerNotificationQueueService.drain = originalFollowerDrain;
    (global as { socketService?: unknown }).socketService = originalSocketService;
    server.close();
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch(() => undefined);
    for (const id of [...gameIds].reverse()) {
      await prisma.game.deleteMany({ where: { id } }).catch(() => undefined);
    }
    const intentIds = (await prisma.playIntent.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((i) => i.id);
    await prisma.playIntentFollowerNotificationJob.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    if (intentIds.length) {
      await prisma.playIntentMatchJob.deleteMany({ where: { sourceId: { in: intentIds } } }).catch(() => undefined);
    }
    await prisma.playIntent.deleteMany({ where: { userId: { in: userIds } } }).catch(() => undefined);
    await prisma.club.deleteMany({ where: { cityId: { in: [home.id, other.id] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => undefined);
    await prisma.city.deleteMany({ where: { id: { in: [home.id, other.id] } } }).catch(() => undefined);
  }
}

main().then(
  async () => {
    console.log('agentPlayIntent.integration.test.ts: ok');
    await prisma.$disconnect();
    process.exit(0);
  },
  async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  },
);
