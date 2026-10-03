import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AgentRun } from '@prisma/client';
import prisma from '../../src/config/database';
import { textOfBlocks } from '../../src/services/agent/agentChat.service';
import type { AgentLlmMessage } from '../../src/services/agent/llm/deepseekStream';
import type { AgentContentBlock } from '@bandeja/shared/agentContract';
import { buildEvalCases } from './cases';
import { runChecks, type Collected, type EvalToolCall } from './checks';
import { cleanupStaleEvalFixtures, seedEvalFixture, type EvalFixture } from './fixtures';
import { createEvalHarness, ForeignClaimError, type EvalHarness, type HarnessScope } from './harness';
import { printComparison, printSummary, printTable, pricesFromEnv, summarize, type CaseResult, type EvalReport } from './report';
import type { EvalArgs } from './run';
import { blockedCalls, evalScope } from './stubs';
import type { EvalCase } from './types';

const REPORT_DIR = path.resolve(__dirname, 'reports');

/** Stand-in fixture for `--list` (no DB): every leaf reads as a placeholder string. */
function placeholderFixture(): EvalFixture {
  const handler: ProxyHandler<object> = {
    get: (_target, key) => (key === Symbol.toPrimitive ? () => '<fx>' : key === 'toString' ? () => '<fx>' : new Proxy({}, handler)),
  };
  return new Proxy({}, handler) as EvalFixture;
}

function selectCases(all: EvalCase[], args: EvalArgs): EvalCase[] {
  const pattern = args.filter ? new RegExp(args.filter, 'i') : null;
  return all.filter(
    (c) =>
      (!pattern || pattern.test(c.id)) &&
      (!args.locales || args.locales.includes(c.locale)) &&
      (!args.areas || args.areas.includes(c.area)),
  );
}

async function pool<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

function parseArgsJson(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw || '{}') as unknown;
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function collect(chatId: string, runs: AgentRun[], scope: HarnessScope): Promise<Collected> {
  const runIds = new Set(runs.map((r) => r.id));
  const finalRun = runs[runs.length - 1];
  const messages = await prisma.agentMessage.findMany({ where: { chatId }, orderBy: { seq: 'asc' } });
  const toolCalls: EvalToolCall[] = [];
  const byCallId = new Map<string, EvalToolCall>();
  const replyParts: string[] = [];
  for (const message of messages) {
    if (!message.runId || !runIds.has(message.runId)) continue;
    const llm = (Array.isArray(message.llmMessages) ? message.llmMessages : []) as unknown as AgentLlmMessage[];
    for (const m of llm) {
      if (m.role === 'assistant' && m.tool_calls) {
        for (const call of m.tool_calls) {
          const entry: EvalToolCall = {
            runId: message.runId,
            callId: call.id,
            name: call.function.name,
            args: parseArgsJson(call.function.arguments),
            rawArgs: call.function.arguments,
            resultOk: null,
            resultError: null,
          };
          toolCalls.push(entry);
          byCallId.set(call.id, entry);
        }
      } else if (m.role === 'tool') {
        const entry = byCallId.get(m.tool_call_id);
        // First result only: a superseded card later appends an "expired" outcome for the same call.
        if (!entry || entry.resultOk !== null) continue;
        const parsed = parseArgsJson(m.content);
        if (parsed && typeof parsed.ok === 'boolean') {
          entry.resultOk = parsed.ok;
          const data = parsed.data as Record<string, unknown> | undefined;
          if (!parsed.ok) entry.resultError = String(data?.error ?? 'error');
        }
      }
    }
    if (message.runId === finalRun.id && message.role === 'ASSISTANT') {
      const text = textOfBlocks(message.content as unknown as AgentContentBlock[]).trim();
      if (text) replyParts.push(text);
    }
  }
  const actions = await prisma.agentPendingAction.findMany({ where: { chatId }, orderBy: { createdAt: 'asc' } });
  return {
    runs,
    finalRun,
    toolCalls,
    pendingActions: actions.map((a) => ({ id: a.id, runId: a.runId, toolName: a.toolName, status: a.status })),
    finalReply: replyParts.join('\n\n'),
    llmCalls: scope.llmCalls,
  };
}

function cacheColumns(run: AgentRun): Record<string, unknown> {
  return Object.fromEntries(Object.entries(run).filter(([key]) => /cache/i.test(key)));
}

async function runCase(harness: EvalHarness, fx: EvalFixture, testCase: EvalCase, attempt: number): Promise<CaseResult> {
  const scope: HarnessScope = { caseKey: `${testCase.id}#${attempt}`, deepseek: [], pending: [], llmCalls: [], usageLog: [] };
  const started = Date.now();
  const base = { id: testCase.id, area: testCase.area, locale: testCase.locale, attempt };
  return evalScope.run(scope, async () => {
    const appLocale = testCase.appLocale ?? 'en';
    let latencyMs = 0;
    const runs: AgentRun[] = [];
    let chatId = '';
    try {
      // Memory tools execute without a card: every memory-writing case gets its own fresh user.
      const userId = testCase.user === 'memory' ? await fx.createScratchUser() : fx.users.main;
      chatId = await harness.createChat(userId);
      if (testCase.history?.length) await harness.seedHistory(chatId, testCase.history);
      for (const text of testCase.turns ?? []) runs.push(await harness.runTurn({ userId, chatId, text, appLocale }));
      const finalStarted = Date.now();
      runs.push(await harness.runTurn({ userId, chatId, text: testCase.message, appLocale }));
      latencyMs = Date.now() - finalStarted;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ...base,
        pass: false,
        error: message.slice(0, 200),
        checks: [{ name: 'run_ok', ok: false, detail: message }],
        failed: ['run_ok'],
        tools: [],
        steps: 0,
        stepsAllRuns: 0,
        status: 'ERROR',
        endReason: null,
        errorCode: null,
        tokens: { input: 0, output: 0, cacheHit: 0, cacheMiss: 0, runCacheColumns: {} },
        latencyMs: Date.now() - started,
        totalMs: Date.now() - started,
        llm: { calls: scope.llmCalls.length, ttftAvgMs: null, toolsOfferedFirst: 0, toolsOfferedMax: 0, systemPromptChars: 0, errors: [] },
        reply: '',
        pendingActions: [],
        foreignClaim: error instanceof ForeignClaimError,
      } as CaseResult & { foreignClaim: boolean };
    }
    await Promise.allSettled(scope.pending);
    const data = await collect(chatId, runs, scope);
    const checks = runChecks(testCase, fx, data, harness.maxSteps);
    const failed = checks.filter((c) => c.ok === false).map((c) => c.name);
    const finalRun = data.finalRun;
    const runIndex = new Map(runs.map((r, i) => [r.id, i]));
    const ttfts = scope.llmCalls.map((c) => c.ttftMs).filter((v): v is number => v !== null);
    const cacheHit = scope.deepseek.reduce((s, u) => s + u.cacheHitTokens, 0);
    const cacheMiss = scope.deepseek.reduce((s, u) => s + u.cacheMissTokens, 0);
    return {
      ...base,
      pass: failed.length === 0,
      error: null,
      checks,
      failed,
      tools: data.toolCalls.map((c) => ({ run: runIndex.get(c.runId) ?? -1, name: c.name, args: c.rawArgs.slice(0, 300), ok: c.resultOk, error: c.resultError })),
      steps: finalRun.steps,
      stepsAllRuns: runs.reduce((s, r) => s + r.steps, 0),
      status: finalRun.status,
      endReason: ((finalRun as unknown as Record<string, unknown>).endReason as string | null | undefined) ?? null,
      errorCode: finalRun.errorCode,
      tokens: {
        input: runs.reduce((s, r) => s + r.inputTokens, 0),
        output: runs.reduce((s, r) => s + r.outputTokens, 0),
        cacheHit,
        cacheMiss,
        runCacheColumns: cacheColumns(finalRun),
      },
      latencyMs,
      totalMs: Date.now() - started,
      llm: {
        calls: scope.llmCalls.length,
        ttftAvgMs: ttfts.length ? Math.round(ttfts.reduce((a, b) => a + b, 0) / ttfts.length) : null,
        toolsOfferedFirst: scope.llmCalls[0]?.toolsOffered.length ?? 0,
        toolsOfferedMax: Math.max(0, ...scope.llmCalls.map((c) => c.toolsOffered.length)),
        systemPromptChars: scope.llmCalls[0]?.systemPromptChars ?? 0,
        errors: scope.llmCalls.map((c) => c.error).filter((e): e is string => Boolean(e)),
      },
      reply: data.finalReply.slice(0, 1200),
      pendingActions: data.pendingActions.map((a) => ({ toolName: a.toolName, status: a.status, final: a.runId === finalRun.id })),
    };
  });
}

function gitSha(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function reportedEnv(args: EvalArgs): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('AGENT_') && value !== undefined && !/KEY|SECRET|TOKEN/.test(key)) out[key] = value;
  }
  for (const [key, value] of Object.entries(args.env)) out[key] = /KEY|SECRET|TOKEN/.test(key) ? '<set>' : value;
  return out;
}

export async function main(args: EvalArgs): Promise<number> {
  if (args.list) {
    const cases = selectCases(buildEvalCases(placeholderFixture()), args);
    for (const c of cases) console.log(`${c.id.padEnd(40)} ${c.area.padEnd(8)} ${c.locale}  ${c.turns?.length ? `[+${c.turns.length} turn] ` : ''}${c.message}`);
    console.log(`${cases.length} cases`);
    return 0;
  }

  const startedAt = new Date();
  const prices = pricesFromEnv();
  const stale = await cleanupStaleEvalFixtures();
  if (stale) console.log(`[agent-eval] removed ${stale} stale eval fixture(s)`);
  const fx = await seedEvalFixture();
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await fx.cleanup().catch((error) => console.error('[agent-eval] cleanup failed', error));
  };
  process.once('SIGINT', () => {
    void cleanup().then(() => process.exit(130));
  });

  let results: CaseResult[] = [];
  let model = 'unknown';
  try {
    const cases = selectCases(buildEvalCases(fx), args);
    if (cases.length === 0) {
      console.log('No cases match.');
      return 1;
    }
    const harness = createEvalHarness({ concurrency: args.concurrency });
    model = harness.model;
    const jobs = cases.flatMap((c) => Array.from({ length: args.repeat }, (_, i) => ({ testCase: c, attempt: i + 1 })));
    console.log(`[agent-eval] model ${model}, ${cases.length} cases x ${args.repeat} = ${jobs.length} runs, concurrency ${args.concurrency}`);
    let done = 0;
    results = await pool(jobs, args.concurrency, async ({ testCase, attempt }) => {
      let result = await runCase(harness, fx, testCase, attempt);
      if ((result as CaseResult & { foreignClaim?: boolean }).foreignClaim) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        result = await runCase(harness, fx, testCase, attempt);
      }
      done += 1;
      const tag = result.pass ? 'PASS' : 'FAIL';
      console.log(`[${String(done).padStart(3)}/${jobs.length}] ${tag} ${result.id}${attempt > 1 ? `#${attempt}` : ''} ${result.error ?? result.failed.join(',')} (${result.latencyMs} ms)`);
      if (args.verbose && !result.pass) {
        console.log(`      tools: ${result.tools.map((t) => `${t.name}${t.args}${t.ok === false ? `!${t.error}` : ''}`).join(' | ')}`);
        console.log(`      reply: ${result.reply.slice(0, 400).replace(/\s+/g, ' ')}`);
        for (const c of result.checks.filter((x) => x.ok === false)) console.log(`      ${c.name}: ${c.detail ?? ''}`);
      }
      return result;
    });
  } finally {
    await cleanup();
  }

  const summary = summarize(results, prices);
  const report: EvalReport = {
    meta: {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      model,
      gitSha: gitSha(),
      argv: args.argv,
      filter: args.filter,
      locales: args.locales,
      repeat: args.repeat,
      concurrency: args.concurrency,
      env: reportedEnv(args),
      prices,
      blockedCalls: [...new Set(blockedCalls)],
    },
    summary,
    results,
  };
  console.log('');
  printTable(results);
  printSummary(summary, results);
  if (blockedCalls.length) console.log(`Blocked outbound calls: ${[...new Set(blockedCalls)].join(', ')}`);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = args.out ?? path.join(REPORT_DIR, `${startedAt.toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`Report: ${file}`);
  if (args.compare) printComparison(report, args.compare);
  await prisma.$disconnect().catch(() => {});
  return 0;
}

