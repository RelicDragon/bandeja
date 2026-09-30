/**
 * Client-executed agent actions (booking plan §14.5, slice 7f) on the dev DB with a fake
 * write tool and a fake post-step (no provider, no LLM):
 *   caps header parsing; propose → always critical, `execution: 'client'`, never
 *   auto-approved; `/confirm` → 409 CLIENT_EXECUTION_REQUIRED; foreign user → 404;
 *   claim re-authorizes (lost rights → FAILED, no attempt); double claim (same key →
 *   same attempt, other key → 409); report with a wrong attemptId → 409; results beyond
 *   the plan → 400; partial result → EXECUTED partial + follow-up run, repeat is a no-op;
 *   lease expiry via the queue sweep → UNKNOWN (+ handoff), late report upgrades it;
 *   all failed → FAILED without the post-step; a throwing post-step → EXECUTED partial.
 * Don't run while a dev server (its agent queue always runs) polls the same database.
 */
import assert from 'node:assert/strict';
import { AgentActionStatus, AgentMessageRole, AgentRunStatus } from '@prisma/client';
import { z } from 'zod/v4';
import type {
  AgentActionResult,
  AgentClientPlan,
  AgentClientReportResult,
} from '@bandeja/shared/agentContract';
import prisma from '../../../../config/database';
import { CORS_ALLOWED_HEADERS } from '../../../../config/corsHeaders';
import { resolveAgentEnvConfig } from '../../../../config/agentEnv';
import { ApiError } from '../../../../utils/ApiError';
import { loadAgentPrincipal } from '../../access/agentPrincipal';
import { autoApproveAgentAction } from '../../agentActionAutoApprove';
import { createAgentActionService } from '../../agentActions.service';
import { createAgentChat, toAgentPendingActionDto } from '../../agentChat.service';
import { InMemoryAgentEventStore } from '../../agentEvents';
import { createAgentRunService } from '../../agentRun.service';
import { AgentToolRegistry, defineTool, type AgentToolContext } from '../../tools/registry';
import { parseAgentClientCaps, supportsClientExecution } from '../clientCaps';
import { createAgentClientExecutionService } from '../clientExecution.service';
import { proposeClientExecutedAction } from '../clientPlan';
import {
  registerAgentClientPostStep,
  unregisterAgentClientPostStep,
  type AgentClientPostStepInput,
} from '../clientPostSteps';

const TOOL = 'fake_client_book';

const fakeTool = defineTool({
  name: TOOL,
  description: 'Test-only client-executed booking.',
  kind: 'write',
  scope: 'user',
  riskTier: 'standard',
  input: z.object({}).strict(),
  label: () => 'Booking',
  handler: async () => ({ data: null, summary: '' }),
  confirm: {
    // Stand-in for a real guard: the principal must (still) be a trainer.
    authorize: async (principal) => {
      if (!principal.isTrainer) throw new ApiError(403, 'Not allowed');
    },
    execute: async () => {
      throw new Error('client-executed actions never execute on the server');
    },
  },
});
const registry = new AgentToolRegistry([fakeTool]);

const PLAN: AgentClientPlan = {
  provider: 'BOOKTIME',
  clubId: 'club-1',
  courts: [
    { courtId: 'court-1', externalCourtId: 'ext-1' },
    { courtId: 'court-2', externalCourtId: 'ext-2' },
  ],
  date: '2026-10-05',
  start: '18:00',
  durationMinutes: 90,
  operation: 'book',
  bookings: [],
  postStep: { kind: 'create_game', gameId: null },
};

function result(courtId: string, ok: boolean, bookingId: string | null = null): AgentClientReportResult {
  return {
    provider: 'BOOKTIME',
    courtId,
    date: PLAN.date,
    start: PLAN.start,
    durationMinutes: PLAN.durationMinutes,
    ok,
    externalBookingId: bookingId,
    bookingRef: null,
    error: ok ? null : 'slot_taken',
  };
}

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
  // --- pure: caps + CORS ------------------------------------------------------------------------
  assert.deepEqual(parseAgentClientCaps('booking-v1'), ['booking-v1']);
  assert.deepEqual(parseAgentClientCaps(' Booking-V1, future-x ,booking-v1'), ['booking-v1']);
  assert.deepEqual(parseAgentClientCaps(undefined), []);
  assert.equal(supportsClientExecution({ clientCaps: ['booking-v1'] }), true);
  assert.equal(supportsClientExecution({ clientCaps: [] }), false);
  assert.equal(supportsClientExecution({}), false);
  assert.ok(CORS_ALLOWED_HEADERS.includes('X-Agent-Client-Caps'));
  console.log('caps header + CORS: ok');

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const owner = await prisma.user.create({
    data: { phone: `qa-agent-client-${suffix}`, firstName: 'Client', lastName: 'Owner', isTrainer: true },
  });
  const stranger = await prisma.user.create({
    data: { phone: `qa-agent-client-x-${suffix}`, firstName: 'Client', lastName: 'Stranger' },
  });
  const chatIds: string[] = [];
  const followUps: { chatId: string; clientCaps?: readonly string[] | null }[] = [];
  const runService = {
    enqueueFollowUpRun: async (input: { chatId: string; clientCaps?: readonly string[] | null }) => {
      followUps.push(input);
      return `follow-up-${followUps.length}`;
    },
  };
  const service = createAgentClientExecutionService({ registry: () => registry, runService: () => runService });
  const actions = createAgentActionService({ registry: () => registry, runService: () => runService });
  const postStepCalls: AgentClientPostStepInput[] = [];
  let postStepThrows = false;
  registerAgentClientPostStep(TOOL, async (ctx, input) => {
    postStepCalls.push(input);
    if (postStepThrows) throw new Error('game create exploded');
    assert.equal(ctx.principal.userId, owner.id);
    return { message: `Booked ${input.succeeded.length} court(s)`, modelData: { gameId: 'g-1' } };
  });

  try {
    const chat = await createAgentChat(owner.id);
    chatIds.push(chat.id);

    let callSeq = 0;
    async function propose(): Promise<string> {
      const run = await prisma.agentRun.create({
        data: {
          chatId: chat.id,
          userId: owner.id,
          status: AgentRunStatus.AWAITING_CONFIRMATION,
          clientCaps: ['booking-v1'],
        },
      });
      const principal = await loadAgentPrincipal(owner.id);
      const ctx: AgentToolContext = {
        principal,
        locale: 'en',
        timezone: 'UTC',
        now: new Date(),
        runId: run.id,
        chatId: chat.id,
        callId: `call_${(callSeq += 1)}`,
        clientCaps: run.clientCaps,
        tool: fakeTool,
      };
      const out = await proposeClientExecutedAction(ctx, {
        toolName: TOOL,
        input: {},
        clientPlan: PLAN,
        post: { createGame: { name: 'secret server payload' } },
        preview: { title: 'Book 2 courts', lines: [], warnings: [] },
      });
      assert.ok(out.awaitingConfirmation);
      return out.awaitingConfirmation.actionId;
    }

    // --- propose: critical, client, never auto-approved; /confirm → 409; stranger → 404 ---------
    const a = await propose();
    {
      const row = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: a } });
      const dto = toAgentPendingActionDto(row);
      assert.equal(dto.execution, 'client');
      assert.equal(dto.riskTier, 'critical');
      assert.equal(dto.canAlwaysAllow, false);
      assert.equal(await autoApproveAgentAction(registry, a, new Date()), null);
      assert.equal((await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: a } })).status, 'PENDING');
      await expectApiError(actions.confirm(owner.id, a), 409, 'CLIENT_EXECUTION_REQUIRED');
      await expectApiError(service.claim(stranger.id, a, 'stranger-key-1'), 404);
      await expectApiError(service.report(stranger.id, a, { attemptId: 'x', results: [] }), 404);
      await expectApiError(actions.confirm(stranger.id, a), 404);
      console.log('propose critical/client, no auto-approve, confirm 409, stranger 404: ok');
    }

    // --- claim re-authorizes: lost rights → FAILED, no attempt ----------------------------------
    {
      await prisma.user.update({ where: { id: owner.id }, data: { isTrainer: false } });
      const claim = await service.claim(owner.id, a, 'device-key-1');
      await prisma.user.update({ where: { id: owner.id }, data: { isTrainer: true } });
      assert.equal(claim.attemptId, null);
      assert.equal(claim.clientPlan, null);
      assert.equal(claim.action.status, 'FAILED');
      assert.ok(claim.runId);
      const row = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: a } });
      assert.equal(row.attemptId, null);
      console.log('claim re-authorizes (lost rights → FAILED): ok');
    }

    // --- double claim, wrong attempt, report beyond the plan, partial ---------------------------
    const b = await propose();
    {
      const first = await service.claim(owner.id, b, 'device-key-1');
      assert.ok(first.attemptId);
      assert.deepEqual(first.clientPlan, PLAN);
      assert.equal(first.action.status, 'CONFIRMED');
      assert.ok(first.leaseExpiresAt && Date.parse(first.leaseExpiresAt) > Date.now() + 2 * 60 * 1000);
      assert.ok(!JSON.stringify(first).includes('secret server payload'), 'post payload never reaches the app');
      const again = await service.claim(owner.id, b, 'device-key-1');
      assert.equal(again.attemptId, first.attemptId);
      await expectApiError(service.claim(owner.id, b, 'device-key-2'), 409, 'ACTION_HANDLED');
      console.log('double claim (same key same attempt, other key 409): ok');

      await expectApiError(
        service.report(owner.id, b, { attemptId: 'wrong-attempt', results: [result('court-1', true, 'bk-1')] }),
        409,
        'ACTION_HANDLED',
      );
      await expectApiError(
        service.report(owner.id, b, {
          attemptId: first.attemptId,
          results: [result('court-1', true, 'bk-1'), result('court-2', true, 'bk-2'), result('court-2', true, 'bk-3')],
        }),
        400,
      );
      await expectApiError(
        service.report(owner.id, b, { attemptId: first.attemptId, results: [result('court-9', true, 'bk-1')] }),
        400,
      );
      await expectApiError(
        service.report(owner.id, b, {
          attemptId: first.attemptId,
          results: [{ ...result('court-1', true, 'bk-1'), start: '19:00' }],
        }),
        400,
      );
      await expectApiError(
        service.report(owner.id, b, {
          attemptId: first.attemptId,
          results: [result('court-1', true, 'bk-1'), result('court-1', true, 'bk-2')],
        }),
        400,
      );
      assert.equal(postStepCalls.length, 0);
      console.log('report: wrong attempt 409, beyond plan / off-plan 400: ok');

      const followUpsBefore = followUps.length;
      const reported = await service.report(owner.id, b, {
        attemptId: first.attemptId,
        results: [result('court-1', true, 'bk-1'), result('court-2', false)],
      });
      assert.equal(reported.action.status, 'EXECUTED');
      const res = reported.action.result as AgentActionResult;
      assert.equal(res.partial, true);
      assert.equal(res.message, 'Booked 1 court(s)');
      assert.equal(postStepCalls.length, 1);
      assert.equal(postStepCalls[0].succeeded.length, 1);
      assert.equal(postStepCalls[0].planned, 2);
      assert.deepEqual(postStepCalls[0].post, { createGame: { name: 'secret server payload' } });
      assert.equal(reported.runId, `follow-up-${followUps.length}`);
      assert.equal(followUps.length, followUpsBefore + 1);
      assert.deepEqual(followUps[followUps.length - 1].clientCaps, ['booking-v1']);
      const tool = await prisma.agentMessage.findFirst({
        where: { chatId: chat.id, role: AgentMessageRole.TOOL },
        orderBy: { seq: 'desc' },
      });
      const raw = JSON.stringify(tool?.llmMessages);
      const toolReply = JSON.parse((tool?.llmMessages as { content: string }[])[0].content) as {
        data: { partial?: boolean; succeeded?: number; planned?: number };
      };
      assert.equal(toolReply.data.partial, true);
      assert.equal(toolReply.data.succeeded, 1);
      assert.equal(toolReply.data.planned, 2);
      assert.ok(!raw.includes('slot_taken') && !raw.includes('bk-1'), 'no provider ids or errors for the model');

      const repeat = await service.report(owner.id, b, {
        attemptId: first.attemptId,
        results: [result('court-1', true, 'bk-1')],
      });
      assert.equal(repeat.action.status, 'EXECUTED');
      assert.equal(repeat.runId, null);
      assert.equal(postStepCalls.length, 1);
      console.log('partial report → EXECUTED partial + follow-up; repeat is a no-op: ok');
    }

    // --- lease expiry via the queue sweep → UNKNOWN; late report upgrades -----------------------
    const c = await propose();
    {
      const claim = await service.claim(owner.id, c, 'device-key-3');
      assert.ok(claim.attemptId);
      await prisma.agentPendingAction.update({ where: { id: c }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
      const runs = createAgentRunService({
        llm: () => null,
        events: new InMemoryAgentEventStore(),
        registry,
        config: () => resolveAgentEnvConfig({}),
        logUsage: async () => {},
        wake: async () => {},
      });
      await runs.sweep();
      runs.stop();
      const unknown = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: c } });
      assert.equal(unknown.status, AgentActionStatus.UNKNOWN);
      const unknownResult = unknown.result as unknown as AgentActionResult;
      assert.match(unknownResult.message ?? '', /Outcome unknown/);
      assert.deepEqual(
        unknownResult.entities?.find((e) => e.type === 'handoff'),
        { type: 'handoff', url: '/profile/connected-clubs', label: 'Club bookings' },
      );
      const note = await prisma.agentMessage.findFirst({
        where: { chatId: chat.id, role: AgentMessageRole.TOOL },
        orderBy: { seq: 'desc' },
      });
      assert.equal(
        (JSON.parse((note?.llmMessages as { content: string }[])[0].content) as { data: { status: string } }).data.status,
        'unknown',
      );
      // A claim after the lease can't start a new attempt.
      const reclaim = await service.claim(owner.id, c, 'device-key-3');
      assert.equal(reclaim.attemptId, null);
      assert.equal(reclaim.action.status, 'UNKNOWN');
      console.log('lease expiry (queue sweep) → UNKNOWN + handoff + model note: ok');

      const late = await service.report(owner.id, c, {
        attemptId: claim.attemptId,
        results: [result('court-1', true, 'bk-11'), result('court-2', true, 'bk-12')],
      });
      assert.equal(late.action.status, 'EXECUTED');
      assert.equal((late.action.result as AgentActionResult).partial, undefined);
      assert.ok(late.runId);
      console.log('late report upgrades UNKNOWN → EXECUTED: ok');
    }

    // --- all failed → FAILED, no post-step; post-step throws → EXECUTED partial ---------------
    const d = await propose();
    {
      const claim = await service.claim(owner.id, d, 'device-key-4');
      const calls = postStepCalls.length;
      const failed = await service.report(owner.id, d, {
        attemptId: claim.attemptId!,
        results: [result('court-1', false), result('court-2', false)],
      });
      assert.equal(failed.action.status, 'FAILED');
      assert.equal(postStepCalls.length, calls);
      const row = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: d } });
      assert.equal(row.error, 'slot_taken; slot_taken');
      console.log('all provider calls failed → FAILED, post-step skipped: ok');
    }
    const e = await propose();
    {
      const claim = await service.claim(owner.id, e, 'device-key-5');
      postStepThrows = true;
      const out = await service.report(owner.id, e, {
        attemptId: claim.attemptId!,
        results: [result('court-1', true, 'bk-21'), result('court-2', true, 'bk-22')],
      });
      postStepThrows = false;
      assert.equal(out.action.status, 'EXECUTED');
      assert.equal((out.action.result as AgentActionResult).partial, true);
      assert.match((out.action.result as AgentActionResult).message ?? '', /follow-up step failed/);
      console.log('post-step throws → EXECUTED partial: ok');
    }
  } finally {
    unregisterAgentClientPostStep(TOOL);
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((err) => console.error('chat cleanup failed', err));
    await prisma.user
      .deleteMany({ where: { id: { in: [owner.id, stranger.id] } } })
      .catch((err) => console.error('user cleanup failed', err));
  }
}

main().then(
  async () => {
    await prisma.$disconnect();
    console.log('agent client execution: all ok');
    process.exit(0);
  },
  async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  },
);
