/**
 * Slice 9b results tools (real dev DB + the HTTP app, no LLM, never the run queue):
 *   - registry: tiers (`enter_match_score` standard, `finish_results` critical), coverage, strict input;
 *   - visibility: a hidden game is the same 404 as a missing id for all three tools;
 *   - guard parity with `requireCanModifyResults`: non-writer 403 (agent and HTTP match PUT),
 *     `resultsByAnyone` participant allowed, parent-season OWNER allowed on a fixture;
 *   - forbidden entity types (EVENT / BAR / TRAINING / LEAGUE_SEASON) → 400;
 *   - HTTP parity: start + score on a HANDMADE game vs `start-results-entry` + match PUT on a twin,
 *     finish vs `POST /recalculate` on the twin (same lineup, sets, winners, statuses);
 *   - stale `baseVersion`: a change after the card → friendly FAILED outcome, nothing overwritten;
 *   - finish preview mirrors the app's confirm (unscored / missing players), FINAL → handoff;
 *   - critical: `finish_results` can't be ALWAYS_ALLOW and a forged row never auto-approves;
 *   - rich cards (slice 9e): the scoreboard card of `get_game_results`, the score / finish
 *     previews' cards, kept out of the model-facing data.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import {
  AgentActionStatus,
  AgentRunStatus,
  AgentToolPermissionMode,
  EntityType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  Sport,
} from '@prisma/client';
import type { AgentActionPreview } from '@bandeja/shared/agentContract';
import type { AgentToolResultWithCard } from '../tools/agentToolCards';
import app from '../../../app';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { generateShortAccessToken } from '../../../utils/jwt';
import * as resultsService from '../../results.service';
import { createAgentPermissionFixture } from '../access/__tests__/agentPermissionMatrix';
import { loadAgentPrincipal, type AgentPrincipal } from '../access/agentPrincipal';
import { autoApproveAgentAction } from '../agentActionAutoApprove';
import { createAgentChat } from '../agentChat.service';
import { AgentToolPermissionService } from '../agentToolPermission.service';
import { AGENT_RESULTS_I18N_EN as EN } from '../i18n/agentResultsI18n';
import { AGENT_TOOL_DEFINITIONS, getAgentToolRegistry } from '../tools';
import { AGENT_TOOL_AUTHZ_COVERAGE } from '../tools/__tests__/agentToolCoverage';
import type { AgentToolContext } from '../tools/registry';

const registry = getAgentToolRegistry();
const getResults = registry.get('get_game_results')!;
const enterScore = registry.get('enter_match_score')!;
const finish = registry.get('finish_results')!;
const HOUR = 60 * 60 * 1000;

type Board = {
  resultsStatus: string;
  status: string;
  rounds: Array<{ id: string; matches: Array<{ id: string; resultsVersion: string; winnerId: string | null; sets: Array<{ teamAScore: number; teamBScore: number }>; teams: Array<{ teamNumber: number; players: Array<{ userId: string }> }> }> }>;
};

async function main(): Promise<void> {
  assert.ok(getResults && enterScore && finish, 'results tools registered');
  assert.equal(getResults.kind, 'read');
  assert.equal(enterScore.riskTier, 'standard');
  assert.equal(finish.riskTier, 'critical');
  for (const name of ['get_game_results', 'enter_match_score', 'finish_results']) {
    assert.ok(AGENT_TOOL_DEFINITIONS.some((t) => t.name === name));
    assert.match(AGENT_TOOL_AUTHZ_COVERAGE[name], /^results-(read|write)-cases$/);
  }
  // Strict input: no actor ids, no free-form player objects, no versions from the model.
  const okArgs = { gameId: 'g', sets: [{ teamA: 6, teamB: 4 }] };
  assert.equal(enterScore.input.safeParse(okArgs).success, true);
  for (const bad of [
    { ...okArgs, userId: 'x' },
    { ...okArgs, baseVersion: 'v' },
    { ...okArgs, teamA: ['x'] },
    { ...okArgs, lineup: { teamA: ['a'], teamB: ['b'], extra: 1 } },
    { ...okArgs, sets: [{ teamA: 6, teamB: 4, role: 'EXTRA_GAMES' }] },
    { ...okArgs, sets: [] },
  ]) {
    assert.equal(enterScore.input.safeParse(bad).success, false, JSON.stringify(bad));
  }
  assert.equal(finish.input.safeParse({ gameId: 'g', force: true }).success, false);

  const fixture = await createAgentPermissionFixture();
  const s = fixture.suffix;
  const P = fixture.principals;
  const gameIds: string[] = [];
  const chatIds: string[] = [];
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    // Four PLAYING players: owner, gameAdmin, player, and "invited" used as the 4th player.
    type Roster = [keyof typeof P, ParticipantRole][];
    const FOUR: Roster = [
      ['owner', ParticipantRole.OWNER],
      ['gameAdmin', ParticipantRole.ADMIN],
      ['player', ParticipantRole.PARTICIPANT],
      ['invited', ParticipantRole.PARTICIPANT],
    ];
    const mkGame = async (name: string, extra: Record<string, unknown> = {}, roster: Roster = FOUR) => {
      const game = await prisma.game.create({
        data: {
          name: `${name} ${s}`,
          entityType: EntityType.GAME,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: fixture.cityId,
          startTime: new Date(Date.now() + 24 * HOUR),
          endTime: new Date(Date.now() + 25 * HOUR),
          timeIsSet: true,
          isPublic: true,
          affectsRating: false,
          maxParticipants: 4,
          playersPerMatch: 4,
          participants: { create: roster.map(([actor, role]) => ({ userId: P[actor].userId, role, status: ParticipantStatus.PLAYING })) },
          ...extra,
        },
        select: { id: true },
      });
      gameIds.push(game.id);
      return game.id;
    };
    const lineup = { teamA: [P.owner.userId, P.gameAdmin.userId], teamB: [P.player.userId, P.invited.userId] };

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
      return { principal, locale, timezone: 'UTC', now: new Date(), runId: host.runId, chatId: host.chatId, callId: `call_res_${callSeq}` };
    };
    const expirePending = () =>
      prisma.agentPendingAction.updateMany({ where: { chatId: { in: chatIds }, status: AgentActionStatus.PENDING }, data: { status: AgentActionStatus.EXPIRED } });
    const tools = { enter_match_score: enterScore, finish_results: finish };
    /** Handler call; returns the proposal (plan + preview) or the non-proposing result. */
    const call = async (name: keyof typeof tools, principal: AgentPrincipal, args: Record<string, unknown>, locale = 'en') => {
      const tool = tools[name];
      try {
        const result = await tool.handler(await ctxFor(principal, locale), tool.input.parse(args));
        if (!result.awaitingConfirmation) return { result, plan: null, preview: null };
        const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: result.awaitingConfirmation.actionId } });
        return { result, plan: (action.args as { plan: unknown }).plan, preview: action.preview as unknown as AgentActionPreview };
      } finally {
        await expirePending();
      }
    };
    const propose = async (name: keyof typeof tools, principal: AgentPrincipal, args: Record<string, unknown>, locale = 'en') => {
      const out = await call(name, principal, args, locale);
      assert.ok(out.plan && out.preview, `${name} proposes: ${JSON.stringify(out.result.data)}`);
      return { plan: out.plan, preview: out.preview };
    };
    const confirm = async (name: keyof typeof tools, principal: AgentPrincipal, plan: unknown) => {
      const fresh = await loadAgentPrincipal(principal.userId);
      await tools[name].confirm!.authorize(fresh, plan);
      return tools[name].confirm!.execute({ principal: fresh, locale: 'en', timezone: 'UTC', now: new Date() }, plan);
    };
    const statusOf = async (run: () => Promise<unknown>): Promise<number> => {
      try {
        await run();
        return 200;
      } catch (error) {
        if (error instanceof ApiError) return error.statusCode;
        throw error;
      }
    };
    const http = async (userId: string, method: string, path: string, body?: unknown) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/results${path}`, {
        method,
        headers: { Authorization: `Bearer ${generateShortAccessToken({ userId })}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
      return { status: res.status, data: json?.data };
    };
    const board = async (gameId: string) => (await resultsService.getGameResults(gameId)) as unknown as Board;
    const matchShape = (b: Board) =>
      b.rounds.flatMap((r) =>
        r.matches.map((m) => ({
          sets: m.sets.map((x) => [x.teamAScore, x.teamBScore]),
          teams: [...m.teams].sort((a, c) => a.teamNumber - c.teamNumber).map((t) => t.players.map((p) => p.userId).sort()),
          hasWinner: m.winnerId != null,
        })),
      );
    const warnings = (preview: AgentActionPreview) => preview.warnings ?? [];

    // --- hidden game: same 404 as a missing id ---
    {
      const hidden = await mkGame('Results hidden', { isPublic: false });
      for (const gameId of [hidden, `missing-${s}`]) {
        assert.equal(await statusOf(() => getResults.handler({ principal: P.stranger, locale: 'en', timezone: 'UTC', now: new Date() }, { gameId })), 404);
        assert.equal(await statusOf(() => call('enter_match_score', P.stranger, { gameId, sets: [{ teamA: 6, teamB: 4 }], lineup })), 404);
        assert.equal(await statusOf(() => call('finish_results', P.stranger, { gameId })), 404);
      }
      const viaRegistry = await registry.executeTool(await ctxFor(P.stranger), 'get_game_results', { gameId: hidden });
      assert.deepEqual(viaRegistry.data, { error: 'not_found' });
      console.log('hidden → 404: ok');
    }

    // --- HTTP parity: start + score, then finish (agent on A, HTTP on twin B) ---
    {
      const gA = await mkGame('Results parity A');
      const gB = await mkGame('Results parity B');
      const sets = [{ teamA: 6, teamB: 4 }, { teamA: 6, teamB: 3 }];

      const { plan, preview } = await propose('enter_match_score', P.owner, { gameId: gA, sets, lineup });
      assert.ok(warnings(preview).includes(EN['warn.startsResults']), 'start is on the card');
      assert.ok(warnings(preview).includes(EN['warn.notStartedYet']), 'ANNOUNCED start needs the card to say so');
      assert.ok(preview.lines.some((l) => l.to === 'owner & gameAdmin'), JSON.stringify(preview.lines));
      assert.ok(preview.lines.some((l) => l.to === EN['value.winner'].replace('{{team}}', 'owner & gameAdmin')));
      assert.equal((await board(gA)).resultsStatus, 'NONE', 'nothing changes at propose time');
      // The card: one match, both sides, the new sets, the winner; the model gets no card.
      assert.equal(preview.card?.kind, 'results');
      assert.equal(preview.linesInCard, true);
      if (preview.card?.kind === 'results') {
        assert.equal(preview.card.gameId, gA);
        assert.equal(preview.card.matches.length, 1);
        const m = preview.card.matches[0];
        assert.deepEqual(m.teamA.map((p) => p.name), ['owner', 'gameAdmin']);
        assert.equal(m.teamA[0].you, true, 'the owner is "you"');
        assert.deepEqual(m.sets, [{ teamA: 6, teamB: 4 }, { teamA: 6, teamB: 3 }]);
        assert.equal(m.winner, 'teamA');
      }
      const modelView = await call('enter_match_score', P.owner, { gameId: gA, sets, lineup });
      const modelPreview = (modelView.result.data as { preview: Record<string, unknown> }).preview;
      assert.ok(modelPreview.lines && !('card' in modelPreview) && !('linesInCard' in modelPreview), 'no card for the model');
      const outcome = await confirm('enter_match_score', P.owner, plan);
      assert.ok(!outcome.failed, outcome.message);
      assert.equal(outcome.message, EN['result.scoreSaved'].replace('{{score}}', '6-4 6-3'));

      const started = await http(P.owner.userId, 'POST', `/game/${gB}/start-results-entry`);
      assert.equal(started.status, 200);
      const bB = await board(gB);
      const mB = bB.rounds[0].matches[0];
      const put = await http(P.owner.userId, 'PUT', `/game/${gB}/matches/${mB.id}`, { ...lineup, sets: sets.map((x) => ({ ...x, isTieBreak: false })), baseVersion: mB.resultsVersion });
      assert.equal(put.status, 200);
      const [afterA, afterB] = [await board(gA), await board(gB)];
      assert.deepEqual(matchShape(afterA), matchShape(afterB), 'agent score = HTTP score');
      assert.equal(afterA.resultsStatus, 'IN_PROGRESS');
      assert.deepEqual([afterA.resultsStatus, afterA.status], [afterB.resultsStatus, afterB.status]);

      // Update mode on an existing lineup: the card says what it replaces.
      const again = await propose('enter_match_score', P.owner, { gameId: gA, sets: [{ teamA: 6, teamB: 4 }, { teamA: 3, teamB: 6 }, { teamA: 6, teamB: 2 }] });
      assert.ok(warnings(again.preview).includes(EN['warn.replacesScore'].replace('{{score}}', '6-4 6-3')));
      // A lineup that differs from the match's players is refused with a handoff.
      const differs = await call('enter_match_score', P.owner, { gameId: gA, sets, lineup: { teamA: lineup.teamB, teamB: [P.owner.userId, P.stranger.userId] } });
      assert.equal((differs.result.data as { error: string }).error, 'lineup_differs');
      assert.ok(differs.result.entities?.some((e) => e.type === 'handoff' && e.url === `/games/${gA}`));

      // Stale baseVersion: someone saves after the card was made.
      const current = (await board(gA)).rounds[0].matches[0];
      const other = await http(P.gameAdmin.userId, 'PUT', `/game/${gA}/matches/${current.id}`, { ...lineup, sets: [{ teamA: 7, teamB: 5, isTieBreak: false }, { teamA: 6, teamB: 3, isTieBreak: false }], baseVersion: current.resultsVersion });
      assert.equal(other.status, 200);
      const staleOutcome = await confirm('enter_match_score', P.owner, again.plan);
      assert.deepEqual(staleOutcome.failed, { changed: false });
      assert.equal(staleOutcome.message, EN['result.stale']);
      assert.deepEqual(matchShape(await board(gA))[0].sets, [[7, 5], [6, 3]], 'the newer score is kept');
      // Put A back in step with B for the finish parity.
      const cur = (await board(gA)).rounds[0].matches[0];
      assert.equal((await http(P.owner.userId, 'PUT', `/game/${gA}/matches/${cur.id}`, { ...lineup, sets: sets.map((x) => ({ ...x, isTieBreak: false })), baseVersion: cur.resultsVersion })).status, 200);

      // get_game_results: sides, "you", outcome, canEnterResults.
      const read = await getResults.handler(await ctxFor(P.player), { gameId: gA });
      const data = read.data as { resultsStatus: string; canEnterResults: boolean; matches: Array<{ teamB: Array<{ you?: boolean }>; outcome: string }> };
      assert.equal(data.resultsStatus, 'IN_PROGRESS');
      assert.equal(data.canEnterResults, false, 'a plain participant may not score without resultsByAnyone');
      assert.equal(data.matches[0].outcome, 'teamA');
      assert.ok(data.matches[0].teamB.some((p) => p.you));
      assert.equal(((await getResults.handler(await ctxFor(P.owner), { gameId: gA })).data as { canEnterResults: boolean }).canEnterResults, true);
      const readCard = (read as AgentToolResultWithCard).card;
      assert.equal(readCard?.kind, 'results');
      if (readCard?.kind === 'results') {
        assert.equal(readCard.resultsStatus, 'IN_PROGRESS');
        assert.equal(readCard.matchCount, 1);
        assert.equal(readCard.matches[0].winner, 'teamA');
        assert.ok(readCard.matches[0].teamB.some((p) => p.you));
        assert.ok(readCard.title, 'titled like the game card');
        assert.equal(readCard.standings, undefined, 'no podium before FINAL');
      }
      assert.ok(!JSON.stringify(read.data).includes('"winner"'), 'card fields stay out of the model data');

      // Finish: critical card, then parity with POST /recalculate.
      const fin = await propose('finish_results', P.owner, { gameId: gA });
      assert.ok(fin.preview.lines.some((l) => l.to === '1 of 1'), JSON.stringify(fin.preview.lines));
      assert.ok(warnings(fin.preview).includes(EN['warn.bets']));
      assert.ok(!warnings(fin.preview).includes(EN['warn.ratings']), 'affectsRating=false: no rating note');
      assert.equal(fin.preview.card?.kind, 'results', 'finish card shows the board');
      assert.equal(fin.preview.linesInCard, undefined, 'finish keeps its summary lines');
      const finOutcome = await confirm('finish_results', P.owner, fin.plan);
      assert.ok(!finOutcome.failed, finOutcome.message);
      assert.equal((await http(P.owner.userId, 'POST', `/game/${gB}/recalculate`)).status, 200);
      const [fA, fB] = [await board(gA), await board(gB)];
      assert.equal(fA.resultsStatus, 'FINAL');
      assert.deepEqual([fA.resultsStatus, fA.status], [fB.resultsStatus, fB.status]);
      assert.deepEqual(matchShape(fA), matchShape(fB));
      const winners = async (gameId: string) =>
        (await prisma.gameOutcome.findMany({ where: { gameId }, select: { userId: true, isWinner: true, wins: true, losses: true }, orderBy: { userId: 'asc' } }));
      assert.deepEqual(await winners(gA), await winners(gB), 'same outcomes as the HTTP finish');
      const finalRead = (await getResults.handler(await ctxFor(P.player), { gameId: gA })).data as { standings?: unknown[] };
      assert.equal(finalRead.standings?.length, 4);
      const finalCard = ((await getResults.handler(await ctxFor(P.player), { gameId: gA })) as AgentToolResultWithCard).card;
      assert.ok(finalCard?.kind === 'results' && finalCard.resultsStatus === 'FINAL');
      assert.equal(finalCard.standings?.length, 3, 'podium only');
      assert.ok(finalCard.standings?.some((row) => row.isWinner));

      // FINAL: both writes hand off to the game page; nothing proposed.
      for (const name of ['enter_match_score', 'finish_results'] as const) {
        const out = await call(name, P.owner, name === 'finish_results' ? { gameId: gA } : { gameId: gA, sets });
        assert.equal(out.plan, null);
        assert.equal((out.result.data as { error: string; handoffUrl: string }).error, 'results_final');
        assert.equal((out.result.data as { handoffUrl: string }).handoffUrl, `/games/${gA}`);
      }
      console.log('HTTP parity (start + score, stale baseVersion, finish, FINAL handoff): ok');
    }

    // --- non-writer refused; resultsByAnyone participant allowed ---
    {
      const g = await mkGame('Results writers');
      assert.equal((await http(P.owner.userId, 'POST', `/game/${g}/start-results-entry`)).status, 200);
      const m = (await board(g)).rounds[0].matches[0];
      const body = { ...lineup, sets: [{ teamA: 6, teamB: 2, isTieBreak: false }], baseVersion: m.resultsVersion };
      const args = { gameId: g, sets: [{ teamA: 6, teamB: 2 }], lineup };
      for (const actor of ['player', 'stranger', 'leagueOwner'] as const) {
        assert.equal(await statusOf(() => call('enter_match_score', P[actor], args)), 403, `${actor} agent`);
        assert.equal(await statusOf(() => call('finish_results', P[actor], { gameId: g })), 403, `${actor} finish`);
        assert.equal((await http(P[actor].userId, 'PUT', `/game/${g}/matches/${m.id}`, body)).status, 403, `${actor} HTTP`);
      }
      // A card made by the owner can't be confirmed by a non-writer (confirm re-authorizes).
      const owned = await propose('enter_match_score', P.owner, args);
      assert.equal(await statusOf(() => enterScore.confirm!.authorize(P.player, owned.plan)), 403);
      // resultsByAnyone: any PLAYING participant may score (HTTP says the same).
      await prisma.game.update({ where: { id: g }, data: { resultsByAnyone: true } });
      const byPlayer = await propose('enter_match_score', P.player, args);
      assert.ok(!(await confirm('enter_match_score', P.player, byPlayer.plan)).failed);
      const m2 = (await board(g)).rounds[0].matches[0];
      assert.equal((await http(P.player.userId, 'PUT', `/game/${g}/matches/${m2.id}`, { ...body, baseVersion: m2.resultsVersion })).status, 200);
      assert.equal(await statusOf(() => call('enter_match_score', P.stranger, args)), 403, 'a stranger still not');
      // Lineup players must be PLAYING participants.
      await prisma.game.update({ where: { id: g }, data: { resultsByAnyone: false } });
      const g2 = await mkGame('Results foreign lineup');
      assert.equal(await statusOf(() => call('enter_match_score', P.owner, { gameId: g2, sets: [{ teamA: 6, teamB: 2 }], lineup: { teamA: lineup.teamA, teamB: [P.player.userId, P.stranger.userId] } })), 400);
      assert.equal(await statusOf(() => call('enter_match_score', P.owner, { gameId: g2, sets: [{ teamA: 6, teamB: 2 }] })), 400, 'empty match needs a lineup');
      console.log('writers (non-writer 403 = HTTP, resultsByAnyone, foreign lineup): ok');
    }

    // --- parent season roles inherit ---
    {
      const season = await mkGame('Results season', { entityType: EntityType.LEAGUE_SEASON, isPublic: false }, [['leagueOwner', ParticipantRole.OWNER]]);
      await prisma.gameParticipant.updateMany({ where: { gameId: season }, data: { status: ParticipantStatus.NON_PLAYING } });
      const fixtureGame = await mkGame('Results fixture', { entityType: EntityType.LEAGUE, parentId: season }, [
        ['gameAdmin', ParticipantRole.PARTICIPANT],
        ['player', ParticipantRole.PARTICIPANT],
        ['invited', ParticipantRole.PARTICIPANT],
        ['queued', ParticipantRole.PARTICIPANT],
      ]);
      const fixtureLineup = { teamA: [P.gameAdmin.userId, P.player.userId], teamB: [P.invited.userId, P.queued.userId] };
      const card = await propose('enter_match_score', P.leagueOwner, { gameId: fixtureGame, sets: [{ teamA: 6, teamB: 1 }, { teamA: 6, teamB: 1 }], lineup: fixtureLineup });
      assert.ok(!(await confirm('enter_match_score', P.leagueOwner, card.plan)).failed, 'season owner scores a fixture');
      assert.equal(await statusOf(() => call('enter_match_score', P.player, { gameId: fixtureGame, sets: [{ teamA: 6, teamB: 1 }] })), 403);
      // The season shell itself is refused (no embedded match entry).
      assert.equal(await statusOf(() => call('enter_match_score', P.leagueOwner, { gameId: season, sets: [{ teamA: 6, teamB: 1 }] })), 400);
      await prisma.game.deleteMany({ where: { id: fixtureGame } });
      gameIds.splice(gameIds.indexOf(fixtureGame), 1);
      console.log('season role inheritance: ok');
    }

    // --- forbidden entity types ---
    {
      for (const entityType of [EntityType.EVENT, EntityType.BAR, EntityType.TRAINING]) {
        const g = await mkGame(`Results ${entityType}`, { entityType });
        assert.equal(await statusOf(() => call('enter_match_score', P.owner, { gameId: g, sets: [{ teamA: 6, teamB: 1 }], lineup })), 400, entityType);
        assert.equal(await statusOf(() => call('finish_results', P.owner, { gameId: g })), 400, entityType);
      }
      console.log('forbidden entity types: ok');
    }

    // --- finish preview mirrors the app's confirm; nothing scored → refused ---
    {
      const g = await mkGame('Results summary');
      assert.equal((await http(P.owner.userId, 'POST', `/game/${g}/start-results-entry`)).status, 200);
      const nothing = await call('finish_results', P.owner, { gameId: g });
      assert.equal((nothing.result.data as { error: string }).error, 'nothing_scored');
      const b0 = await board(g);
      const roundId = b0.rounds[0].id;
      const m1 = b0.rounds[0].matches[0];
      await resultsService.updateMatch(g, m1.id, { ...lineup, sets: [{ teamA: 6, teamB: 3 }, { teamA: 6, teamB: 2 }], baseVersion: m1.resultsVersion });
      const m2 = randomUUID();
      const m3 = randomUUID();
      await resultsService.createMatch(g, roundId, m2);
      await resultsService.createMatch(g, roundId, m3);
      const b1 = await board(g);
      const v2 = b1.rounds[0].matches.find((m) => m.id === m2)!.resultsVersion;
      await resultsService.updateMatch(g, m2, { ...lineup, sets: [], baseVersion: v2 });
      const { preview } = await propose('finish_results', P.owner, { gameId: g });
      const byLabel = Object.fromEntries(preview.lines.map((l) => [l.label, l.to]));
      assert.equal(byLabel[EN['field.scored']], '1 of 3');
      assert.equal(byLabel[EN['field.unscored']], 'Round 1 · Match 2');
      assert.equal(byLabel[EN['field.incompleteLineup']], 'Round 1 · Match 3');
      assert.ok(warnings(preview).includes(EN['warn.unscoredIgnored']));
      // Several matches: enter_match_score needs a matchId.
      assert.equal(await statusOf(() => call('enter_match_score', P.owner, { gameId: g, sets: [{ teamA: 6, teamB: 1 }] })), 400);
      // A board change after the finish card → friendly FAILED, still IN_PROGRESS.
      const fin = await propose('finish_results', P.owner, { gameId: g });
      const cur = (await board(g)).rounds[0].matches.find((m) => m.id === m2)!;
      await resultsService.updateMatch(g, m2, { ...lineup, sets: [{ teamA: 6, teamB: 0 }, { teamA: 6, teamB: 0 }], baseVersion: cur.resultsVersion });
      const out = await confirm('finish_results', P.owner, fin.plan);
      assert.deepEqual(out.failed, { changed: false });
      assert.equal((await board(g)).resultsStatus, 'IN_PROGRESS');
      // `ru` card.
      const ru = await call('finish_results', P.owner, { gameId: g }, 'ru');
      assert.ok(ru.preview?.title.startsWith('Завершить результаты'), ru.preview?.title);
      console.log('finish summary (unscored, missing players, stale board, ru): ok');
    }

    // --- critical: never always-allowed ---
    {
      const g = await mkGame('Results critical');
      assert.equal((await http(P.owner.userId, 'POST', `/game/${g}/start-results-entry`)).status, 200);
      const m = (await board(g)).rounds[0].matches[0];
      await resultsService.updateMatch(g, m.id, { ...lineup, sets: [{ teamA: 6, teamB: 3 }, { teamA: 6, teamB: 2 }], baseVersion: m.resultsVersion });
      const permissions = new AgentToolPermissionService(() => registry);
      await assert.rejects(permissions.set(P.owner, 'finish_results', 'ALWAYS_ALLOW'), (e: { statusCode?: number }) => e.statusCode === 400);
      await prisma.agentToolPermission.create({ data: { userId: P.owner.userId, toolName: 'finish_results', mode: AgentToolPermissionMode.ALWAYS_ALLOW } });
      try {
        const executed = await registry.executeTool(await ctxFor(P.owner), 'finish_results', { gameId: g });
        assert.ok(executed.ok && executed.awaitingConfirmation, JSON.stringify(executed.data));
        const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: executed.awaitingConfirmation.actionId } });
        assert.equal((action.args as { riskTier?: string }).riskTier, 'critical');
        assert.equal(await autoApproveAgentAction(registry, action.id, new Date()), null, 'critical is never auto-approved');
        assert.equal((await board(g)).resultsStatus, 'IN_PROGRESS');
      } finally {
        await prisma.agentToolPermission.deleteMany({ where: { userId: P.owner.userId, toolName: 'finish_results' } });
        await expirePending();
      }
      // enter_match_score is standard: it may be always-allowed.
      await permissions.set(P.owner, 'enter_match_score', 'ALWAYS_ALLOW');
      await prisma.agentToolPermission.deleteMany({ where: { userId: P.owner.userId, toolName: 'enter_match_score' } });
      console.log('critical tier: ok');
    }

    console.log('agentResults.integration.test.ts: ok');
  } finally {
    server.close();
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error('chat cleanup failed', e));
    for (const id of [...gameIds].reverse()) {
      await prisma.game.deleteMany({ where: { id } }).catch((e) => console.error('game cleanup failed', e));
    }
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
