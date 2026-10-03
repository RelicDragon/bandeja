/**
 * `GET /api/admin/agent/actions|usage|feedback` (AI agent audit, phase 3d) over real HTTP through the
 * full `app` (real dev DB, no LLM): admins get 200, anyone else 401/403 (including the
 * owner of the audited rows), `userId` / `status` / `limit` / `days` filters work and are
 * validated, and the response carries only the audit fields: no contact data on users, no
 * chat transcript (`AgentMessage.content` / `llmMessages`) outside `/feedback` (rated replies,
 * which carry short excerpts by design).
 */
import './agentRoutesTestEnv';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { AgentActionStatus, AgentMessageFeedback, AgentMessageRole, AgentRunStatus } from '@prisma/client';
import app from '../../app';
import prisma from '../../config/database';
import { generateShortAccessToken } from '../../utils/jwt';
import { createAgentPermissionFixture } from '../../services/agent/access/__tests__/agentPermissionMatrix';

type Json = Record<string, unknown>;
type AuditAction = {
  id: string;
  status: string;
  toolName: string;
  user: Record<string, unknown>;
  [key: string]: unknown;
};
type UsageRow = { day: string; userId: string; user: Record<string, unknown> | null; runs: number; inputTokens: number; outputTokens: number; totalTokens: number };

const ACTION_KEYS = [
  'args', 'callId', 'chatId', 'createdAt', 'error', 'executedAt', 'expiresAt', 'id', 'preview',
  'result', 'runId', 'status', 'toolName', 'updatedAt', 'user',
];

void (async () => {
  let exitCode = 0;
  const fixture = await createAgentPermissionFixture();
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api/admin/agent`;
  const { owner, player, globalAdmin } = fixture.principals;
  const chatIds: string[] = [];
  const secret = `transcript-secret-${fixture.suffix}`;

  const call = async (userId: string | null, path: string) => {
    const res = await fetch(`${base}${path}`, {
      headers: userId ? { Authorization: `Bearer ${generateShortAccessToken({ userId })}` } : {},
    });
    const text = await res.text();
    return { status: res.status, text, body: (text ? JSON.parse(text) : {}) as Json };
  };
  const actionsOf = (body: Json) => (body.data as { actions: AuditAction[] }).actions;

  try {
    // authenticate() geolocates new client IPs; pre-set loopback so the test stays offline.
    await prisma.user.updateMany({
      where: { id: { in: Object.values(fixture.principals).map((p) => p.userId) } },
      data: { lastUserIP: '::ffff:127.0.0.1' },
    });

    // Seed: owner has 3 actions (PENDING, EXECUTED, REJECTED) + 2 runs with tokens; player 1 FAILED.
    const seed = async (userId: string, statuses: AgentActionStatus[], tokens: [number, number][]) => {
      const chat = await prisma.agentChat.create({ data: { userId, title: `Audit ${fixture.suffix}` } });
      chatIds.push(chat.id);
      await prisma.agentMessage.create({
        data: { chatId: chat.id, seq: 1, role: AgentMessageRole.USER, content: { text: secret }, llmMessages: [{ role: 'user', content: secret }] },
      });
      const runs = [];
      for (const [inputTokens, outputTokens] of tokens) {
        runs.push(await prisma.agentRun.create({ data: { chatId: chat.id, userId, status: AgentRunStatus.COMPLETED, inputTokens, outputTokens } }));
      }
      // Rated replies: a thumbs-down (with comment) answering a USER message, and a thumbs-up.
      await prisma.agentMessage.create({
        data: { chatId: chat.id, seq: 2, role: AgentMessageRole.USER, content: [{ type: 'text', text: `Question ${fixture.suffix}` }] },
      });
      const now = new Date();
      await prisma.agentMessage.create({
        data: {
          chatId: chat.id,
          seq: 3,
          role: AgentMessageRole.ASSISTANT,
          content: [{ type: 'text', text: `Bad answer ${fixture.suffix}` }],
          feedback: AgentMessageFeedback.DOWN,
          feedbackComment: 'Wrong day',
          feedbackAt: now,
        },
      });
      await prisma.agentMessage.create({
        data: {
          chatId: chat.id,
          seq: 4,
          role: AgentMessageRole.ASSISTANT,
          content: [{ type: 'text', text: 'Good answer' }],
          feedback: AgentMessageFeedback.UP,
          feedbackAt: now,
        },
      });
      const ids: string[] = [];
      for (const status of statuses) {
        const row = await prisma.agentPendingAction.create({
          data: {
            runId: runs[0].id,
            chatId: chat.id,
            userId,
            toolName: 'update_game',
            callId: `audit_${status}`,
            args: { input: { gameId: fixture.games.public }, plan: {}, locale: 'en', timezone: 'UTC' },
            preview: { title: 'Change game', lines: [], warnings: [] },
            status,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            ...(status === AgentActionStatus.FAILED ? { error: 'internal detail' } : {}),
          },
        });
        ids.push(row.id);
      }
      return ids;
    };
    const ownerActionIds = await seed(owner.userId, [AgentActionStatus.PENDING, AgentActionStatus.EXECUTED, AgentActionStatus.REJECTED], [[100, 10], [50, 5]]);
    const playerActionIds = await seed(player.userId, [AgentActionStatus.FAILED], [[7, 3]]);

    // --- access -----------------------------------------------------------------------------------
    for (const path of ['/actions', '/usage', '/feedback']) {
      assert.equal((await call(null, path)).status, 401, `${path}: no token = 401`);
      assert.equal((await call(owner.userId, path)).status, 403, `${path}: non-admin (owner of the rows) = 403`);
      assert.equal((await call(player.userId, path)).status, 403, `${path}: non-admin = 403`);
      assert.equal((await call(globalAdmin.userId, path)).status, 200, `${path}: admin = 200`);
    }

    // --- actions: filters ---------------------------------------------------------------------------
    let res = await call(globalAdmin.userId, `/actions?userId=${owner.userId}`);
    assert.equal(res.status, 200);
    let actions = actionsOf(res.body);
    assert.deepEqual(actions.map((a) => a.id).sort(), [...ownerActionIds].sort(), 'userId filter');
    assert.ok(actions.every((a) => a.user.id === owner.userId));
    assert.ok(
      actions.every((a, i) => i === 0 || String(actions[i - 1].createdAt) >= String(a.createdAt)),
      'newest first',
    );

    res = await call(globalAdmin.userId, `/actions?userId=${owner.userId}&status=EXECUTED`);
    assert.deepEqual(actionsOf(res.body).map((a) => a.id), [ownerActionIds[1]], 'status filter');
    res = await call(globalAdmin.userId, `/actions?userId=${player.userId}&status=FAILED`);
    assert.deepEqual(actionsOf(res.body).map((a) => a.id), playerActionIds);
    assert.equal(actionsOf(res.body)[0].error, 'internal detail', 'admins see the internal failure detail');
    res = await call(globalAdmin.userId, `/actions?userId=${player.userId}&status=EXECUTED`);
    assert.deepEqual(actionsOf(res.body), []);
    res = await call(globalAdmin.userId, `/actions?userId=${owner.userId}&limit=2`);
    assert.equal(actionsOf(res.body).length, 2, 'limit');

    assert.equal((await call(globalAdmin.userId, '/actions?status=DONE')).status, 400, 'unknown status');
    assert.equal((await call(globalAdmin.userId, '/actions?limit=0')).status, 400);
    assert.equal((await call(globalAdmin.userId, '/actions?limit=201')).status, 400, 'limit capped');
    assert.equal((await call(globalAdmin.userId, `/actions?userId=${'x'.repeat(65)}`)).status, 400);

    // --- actions: only audit fields -----------------------------------------------------------------
    res = await call(globalAdmin.userId, `/actions?userId=${owner.userId}`);
    for (const action of actionsOf(res.body)) {
      assert.deepEqual(Object.keys(action).sort(), ACTION_KEYS, 'action fields');
      assert.deepEqual(Object.keys(action.user).sort(), ['firstName', 'id', 'isAdmin', 'lastName'], 'no contact fields on users');
    }
    assert.ok(!res.text.includes(secret), 'no chat transcript in the audit');
    assert.ok(!/"(phone|email|telegramId|telegramUsername|llmMessages|content)"/.test(res.text), 'no contact data or messages');

    // --- usage --------------------------------------------------------------------------------------
    res = await call(globalAdmin.userId, `/usage?userId=${owner.userId}&days=1`);
    assert.equal(res.status, 200);
    const usage = res.body.data as { since: string; days: number; rows: UsageRow[] };
    assert.equal(usage.days, 1);
    assert.equal(usage.rows.length, 1, 'one UTC day, one user');
    const [row] = usage.rows;
    assert.equal(row.userId, owner.userId);
    assert.equal(row.day, new Date().toISOString().slice(0, 10));
    assert.deepEqual([row.runs, row.inputTokens, row.outputTokens, row.totalTokens], [2, 150, 15, 165]);
    assert.deepEqual(Object.keys(row).sort(), ['cachedInputTokens', 'day', 'inputTokens', 'outputTokens', 'runs', 'totalTokens', 'user', 'userId']);
    const endReasons = (res.body.data as { endReasons: { endReason: string | null; runs: number }[] }).endReasons;
    assert.equal(endReasons.reduce((sum, r) => sum + r.runs, 0), 2, 'end reason counts cover the runs in the window');
    assert.deepEqual(Object.keys(row.user ?? {}).sort(), ['firstName', 'id', 'lastName'], 'no contact fields on usage users');

    res = await call(globalAdmin.userId, '/usage?days=1');
    const all = (res.body.data as { rows: UsageRow[] }).rows;
    const mine = all.filter((r) => r.userId === owner.userId || r.userId === player.userId);
    assert.deepEqual(mine.map((r) => [r.userId, r.totalTokens]).sort(), [[owner.userId, 165], [player.userId, 10]].sort(), 'unfiltered covers every user');
    assert.ok(!res.text.includes(secret));

    // --- feedback (thumbs) --------------------------------------------------------------------------
    res = await call(globalAdmin.userId, `/usage?userId=${owner.userId}&days=1`);
    assert.deepEqual(
      (res.body.data as { feedback: unknown[] }).feedback,
      [{ day: new Date().toISOString().slice(0, 10), up: 1, down: 1 }],
      'thumbs per UTC day in usage',
    );
    type FeedbackItem = { chatId: string; messageId: string; rating: string; comment: string | null; text: string; userText: string | null; user: { id: string } };
    res = await call(globalAdmin.userId, `/feedback?userId=${owner.userId}`);
    assert.equal(res.status, 200);
    const downs = (res.body.data as { feedback: FeedbackItem[] }).feedback;
    assert.equal(downs.length, 1, 'thumbs-down by default');
    assert.equal(downs[0].rating, 'down');
    assert.equal(downs[0].comment, 'Wrong day');
    assert.equal(downs[0].text, `Bad answer ${fixture.suffix}`);
    assert.equal(downs[0].userText, `Question ${fixture.suffix}`, 'the user message it answered');
    assert.equal(downs[0].user.id, owner.userId);
    assert.ok(!res.text.includes('llmMessages'));
    res = await call(globalAdmin.userId, `/feedback?userId=${owner.userId}&rating=up`);
    assert.deepEqual((res.body.data as { feedback: FeedbackItem[] }).feedback.map((f) => f.text), ['Good answer']);
    res = await call(globalAdmin.userId, '/feedback?limit=200');
    const everyone = (res.body.data as { feedback: FeedbackItem[] }).feedback;
    assert.ok(everyone.some((f) => f.user.id === player.userId) && everyone.some((f) => f.user.id === owner.userId));
    assert.equal((await call(globalAdmin.userId, '/feedback?rating=meh')).status, 400);
    assert.equal((await call(globalAdmin.userId, '/feedback?limit=201')).status, 400);

    assert.equal((await call(globalAdmin.userId, '/usage?days=0')).status, 400);
    assert.equal((await call(globalAdmin.userId, '/usage?days=91')).status, 400, 'days capped');

    console.log('agentAdmin.routes.http.integration.test.ts: ok');
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
