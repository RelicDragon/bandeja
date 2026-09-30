/**
 * `/api/agent` over real HTTP through the full `app` (real dev DB, no LLM):
 * feature flag + allowlist, ownership 404s, error codes, per-user rate limit, and the
 * SSE endpoint (headers, no gzip, `?after=` / `Last-Event-ID` replay, live frames,
 * close on terminal, synthetic replay from the DB), and confirm / reject of a pending action.
 */
import './agentRoutesTestEnv';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AgentRunStatus } from '@prisma/client';
import app from '../../app';
import prisma from '../../config/database';
import { generateShortAccessToken } from '../../utils/jwt';
import { createAgentPermissionFixture } from '../../services/agent/access/__tests__/agentPermissionMatrix';
import { AGENT_SYNTHETIC_EVENT_ID_BASE, getAgentEventStore } from '../../services/agent/agentEvents';
import { loadAgentPrincipal } from '../../services/agent/access/agentPrincipal';
import { getAgentToolRegistry } from '../../services/agent/tools';

type Json = Record<string, unknown>;

void (async () => {
  let exitCode = 0;
  const fixture = await createAgentPermissionFixture();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api/agent`;
  const token = (userId: string) => generateShortAccessToken({ userId });
  const { owner, player, stranger } = fixture.principals;
  const chatIds: string[] = [];

  const call = async (userId: string, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token(userId)}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json };
  };

  /** Raw SSE read: resolves with headers + full body once the server ends the stream. */
  const sse = (userId: string, path: string, headers: Record<string, string> = {}, onOpen?: () => void) =>
    new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const req = http.request(
        `${base}${path}`,
        { headers: { Authorization: `Bearer ${token(userId)}`, 'Accept-Encoding': 'gzip, deflate, br', ...headers } },
        (res) => {
          let body = '';
          let opened = false;
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            body += chunk;
            if (!opened && body.includes(': connected')) {
              opened = true;
              onOpen?.();
            }
          });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
        },
      );
      req.on('error', reject);
      req.end();
    });

  const frameIds = (body: string) => [...body.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
  const frameTypes = (body: string) => [...body.matchAll(/^event: (.+)$/gm)].map((m) => m[1]);

  try {
    // authenticate() geolocates new client IPs; pre-set loopback so the test stays offline.
    await prisma.user.updateMany({
      where: { id: { in: Object.values(fixture.principals).map((p) => p.userId) } },
      data: { lastUserIP: '::ffff:127.0.0.1' },
    });
    // --- auth: every user is allowed; a token is still required ------------------------------
    assert.equal((await fetch(`${base}/chats`)).status, 401);
    let res = await call(stranger.userId, 'GET', '/chats');
    assert.equal(res.status, 200, 'the agent is on for every user');

    // --- chats + ownership ----------------------------------------------------------------------
    res = await call(owner.userId, 'POST', '/chats', {});
    assert.equal(res.status, 201);
    const chat = res.body.data as { id: string; title: string | null; activeRun: unknown };
    chatIds.push(chat.id);
    assert.equal(chat.title, null);
    assert.equal(chat.activeRun, null);
    assert.equal((await call(player.userId, 'GET', `/chats/${chat.id}`)).status, 404, 'foreign chat = 404');
    assert.equal((await call(player.userId, 'PATCH', `/chats/${chat.id}`, { title: 'x' })).status, 404);
    assert.equal((await call(player.userId, 'DELETE', `/chats/${chat.id}`)).status, 404);
    assert.equal((await call(player.userId, 'POST', `/chats/${chat.id}/messages`, { text: 'hi' })).status, 404);
    res = await call(owner.userId, 'PATCH', `/chats/${chat.id}`, { title: '  Renamed  ' });
    assert.equal((res.body.data as { title: string }).title, 'Renamed');
    const list = await call(owner.userId, 'GET', '/chats');
    assert.deepEqual((list.body.data as { chats: { id: string }[] }).chats.map((c) => c.id), [chat.id]);
    assert.equal((await call(player.userId, 'GET', '/chats')).body.data && ((await call(player.userId, 'GET', '/chats')).body.data as { chats: unknown[] }).chats.length, 0);

    // --- message validation, LLM missing, rate limit ---------------------------------------------
    res = await call(owner.userId, 'POST', `/chats/${chat.id}/messages`, { text: 'x'.repeat(4001) });
    assert.equal(res.status, 400);
    process.env.AGENT_RATE_LIMIT_MAX = '2'; // the 400 above already counted as one
    res = await call(owner.userId, 'POST', `/chats/${chat.id}/messages`, { text: 'hello' });
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'LLM_ERROR');
    res = await call(owner.userId, 'POST', `/chats/${chat.id}/messages`, { text: 'hello' });
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
    res = await call(player.userId, 'POST', `/chats/${chat.id}/messages`, { text: 'hello' });
    assert.equal(res.status, 404, 'limit is per user, not global');

    // --- actions: confirm / reject ------------------------------------------------------------------
    assert.equal((await call(owner.userId, 'POST', `/actions/missing-${fixture.suffix}/confirm`)).status, 404);
    {
      const hostRun = await prisma.agentRun.create({
        data: { chatId: chat.id, userId: owner.userId, status: AgentRunStatus.AWAITING_CONFIRMATION },
      });
      const updateGame = getAgentToolRegistry().get('update_game')!;
      const proposeDescription = async (description: string) => {
        const principal = await loadAgentPrincipal(owner.userId);
        const result = await updateGame.handler(
          { principal, locale: 'en', timezone: 'UTC', now: new Date(), runId: hostRun.id, chatId: chat.id, callId: `http_${description}` },
          updateGame.input.parse({ gameId: fixture.games.public, patch: { description } }),
        );
        return result.awaitingConfirmation!.actionId;
      };
      const first = await proposeDescription(`first-${fixture.suffix}`);
      assert.equal((await call(player.userId, 'POST', `/actions/${first}/confirm`)).status, 404, 'foreign action = 404');
      assert.equal((await call(player.userId, 'POST', `/actions/${first}/reject`)).status, 404);
      res = await call(owner.userId, 'POST', `/actions/${first}/reject`);
      assert.equal(res.status, 200);
      assert.equal((res.body.data as { action: { status: string }; runId: null }).action.status, 'REJECTED');
      assert.equal((res.body.data as { runId: unknown }).runId, null);
      assert.equal((await call(owner.userId, 'POST', `/actions/${first}/confirm`)).status, 409, 'rejected cannot be confirmed');

      const second = await proposeDescription(`second-${fixture.suffix}`);
      res = await call(owner.userId, 'POST', `/actions/${second}/confirm`);
      assert.equal(res.status, 200);
      const confirmed = res.body.data as { action: { status: string; result: { ok: boolean } }; runId: string | null };
      assert.equal(confirmed.action.status, 'EXECUTED');
      assert.equal(confirmed.action.result.ok, true);
      assert.equal(confirmed.runId, null, 'no LLM configured → no follow-up run, the write still happened');
      assert.equal((res.body.data as { remembered: boolean }).remembered, false, 'no remember body → nothing stored');
      assert.equal((await prisma.game.findUniqueOrThrow({ where: { id: fixture.games.public } })).description, `second-${fixture.suffix}`);
      const detail = (await call(owner.userId, 'GET', `/chats/${chat.id}`)).body.data as { actions: { id: string; status: string }[]; activeRun: unknown };
      assert.deepEqual(detail.actions.map((a) => a.status), ['REJECTED', 'EXECUTED']);
      assert.equal(detail.activeRun, null, 'the paused run completed');
    }

    // --- tool permissions (plan §15) --------------------------------------------------------------
    {
      type PermissionDto = { toolName: string; name: string; mode: string; riskTier: string; canAlwaysAllow: boolean };
      res = await call(owner.userId, 'GET', '/permissions');
      assert.equal(res.status, 200);
      const tools = (res.body.data as { tools: PermissionDto[] }).tools;
      assert.ok(tools.some((t) => t.toolName === 'update_game' && t.mode === 'ASK' && t.canAlwaysAllow));
      assert.ok(!tools.some((t) => t.toolName.startsWith('admin_')));
      res = await call(owner.userId, 'PUT', '/permissions/remove_participant', { mode: 'ALWAYS_ALLOW' });
      assert.equal(res.status, 400);
      assert.equal(res.body.code, 'PERMISSION_NOT_ALLOWED');
      assert.equal((await call(owner.userId, 'PUT', '/permissions/update_game', { mode: 'SOMETIMES' })).status, 400);
      assert.equal((await call(owner.userId, 'PUT', '/permissions/nope_tool', { mode: 'ASK' })).status, 404);
      res = await call(owner.userId, 'PUT', '/permissions/update_game', { mode: 'ALWAYS_ALLOW' });
      assert.equal(res.status, 200);
      assert.equal((res.body.data as PermissionDto).mode, 'ALWAYS_ALLOW');
      const playerTools = (await call(player.userId, 'GET', '/permissions')).body.data as { tools: PermissionDto[] };
      assert.equal(playerTools.tools.find((t) => t.toolName === 'update_game')?.mode, 'ASK', 'scoped to the user');
      res = await call(owner.userId, 'DELETE', '/permissions/update_game');
      assert.equal((res.body.data as PermissionDto).mode, 'ASK');
      await call(owner.userId, 'PUT', '/permissions/join_game', { mode: 'ALWAYS_ALLOW' });
      res = await call(owner.userId, 'DELETE', '/permissions');
      assert.ok((res.body.data as { tools: PermissionDto[] }).tools.every((t) => t.mode === 'ASK'));
      assert.equal(await prisma.agentToolPermission.count({ where: { userId: owner.userId } }), 0);
    }

    // --- SSE: live run ---------------------------------------------------------------------------
    const store = getAgentEventStore();
    const liveRun = await prisma.agentRun.create({
      data: { chatId: chat.id, userId: owner.userId, status: AgentRunStatus.RUNNING, startedAt: new Date(), heartbeatAt: new Date(), workerId: 'elsewhere:api:1:x' },
    });
    await store.open(liveRun.id);
    await store.append(liveRun.id, { type: 'run.started', runId: liveRun.id, chatId: chat.id });
    await store.append(liveRun.id, { type: 'text.delta', text: 'Hello' });
    await store.append(liveRun.id, { type: 'text.delta', text: ' there' });

    assert.equal((await sse(player.userId, `/runs/${liveRun.id}/events`)).status, 404, 'foreign run = 404');
    const live = sse(owner.userId, `/runs/${liveRun.id}/events?after=1`, { 'Last-Event-ID': '2' }, () => {
      void (async () => {
        await store.append(liveRun.id, { type: 'text.delta', text: '!' });
        await store.append(liveRun.id, { type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 1, outputTokens: 1 } });
      })();
    });
    const liveResult = await live;
    assert.equal(liveResult.status, 200);
    assert.match(String(liveResult.headers['content-type']), /^text\/event-stream/);
    assert.equal(liveResult.headers['cache-control'], 'no-cache, no-transform');
    assert.equal(liveResult.headers['x-accel-buffering'], 'no');
    assert.equal(liveResult.headers['content-encoding'], undefined, 'compression bypassed');
    assert.deepEqual(frameIds(liveResult.body), [3, 4, 5], 'replay after max(after, Last-Event-ID) then live');
    assert.deepEqual(frameTypes(liveResult.body), ['text.delta', 'text.delta', 'run.completed']);

    // Already finished: replay only (from the start, text deltas included), then close.
    const done = await sse(owner.userId, `/runs/${liveRun.id}/events`);
    assert.deepEqual(frameIds(done.body), [1, 2, 3, 4, 5]);
    await prisma.agentRun.update({ where: { id: liveRun.id }, data: { status: AgentRunStatus.COMPLETED, endedAt: new Date() } });

    // --- SSE: QUEUED run, no log in this process → fresh log; cancel over HTTP closes it ------------
    const queuedRun = await prisma.agentRun.create({ data: { chatId: chat.id, userId: owner.userId, status: AgentRunStatus.QUEUED } });
    const queuedStream = sse(owner.userId, `/runs/${queuedRun.id}/events`, {}, () => {
      void call(owner.userId, 'POST', `/runs/${queuedRun.id}/cancel`);
    });
    const queuedResult = await queuedStream;
    assert.deepEqual(frameTypes(queuedResult.body), ['run.queued', 'run.cancelled']);
    assert.equal((await prisma.agentRun.findUniqueOrThrow({ where: { id: queuedRun.id } })).status, AgentRunStatus.CANCELLED);

    // --- SSE: no live log (restart / expired) → synthetic from DB -------------------------------
    const oldRun = await prisma.agentRun.create({
      data: { chatId: chat.id, userId: owner.userId, status: AgentRunStatus.CANCELLED, endedAt: new Date() },
    });
    const synthetic = await sse(owner.userId, `/runs/${oldRun.id}/events?after=5`);
    assert.deepEqual(frameTypes(synthetic.body), ['run.started', 'run.cancelled']);
    assert.ok(frameIds(synthetic.body).every((id) => id > AGENT_SYNTHETIC_EVENT_ID_BASE));

    // --- cancel + archive ---------------------------------------------------------------------------
    assert.equal((await call(player.userId, 'POST', `/runs/${oldRun.id}/cancel`)).status, 404);
    assert.equal((await call(owner.userId, 'POST', `/runs/${oldRun.id}/cancel`)).status, 200);
    assert.equal((await call(owner.userId, 'DELETE', `/chats/${chat.id}`)).status, 200);
    assert.equal((await call(owner.userId, 'GET', `/chats/${chat.id}`)).status, 404, 'archived chat is gone');

    console.log('agent.routes.http.integration.test.ts: ok');
  } catch (error) {
    exitCode = 1;
    console.error(error);
  } finally {
    server.close();
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error(e));
    await fixture.cleanup().catch((e) => console.error(e));
    await prisma.$disconnect();
    process.exit(exitCode);
  }
})();
