/**
 * Console table, summary, cost estimate and `--compare` diff for eval reports.
 */
import fs from 'node:fs';
import type { CheckResult, EvalArea } from './types';

export type CaseResult = {
  id: string;
  area: EvalArea;
  locale: string;
  attempt: number;
  pass: boolean;
  error: string | null;
  checks: CheckResult[];
  failed: string[];
  tools: { run: number; name: string; args: string; ok: boolean | null; error: string | null }[];
  steps: number;
  stepsAllRuns: number;
  status: string;
  endReason: string | null;
  errorCode: string | null;
  tokens: {
    input: number;
    output: number;
    cacheHit: number;
    cacheMiss: number;
    /** Columns of the AgentRun row whose name mentions "cache" (sibling work may add them). */
    runCacheColumns: Record<string, unknown>;
  };
  latencyMs: number;
  totalMs: number;
  llm: { calls: number; ttftAvgMs: number | null; toolsOfferedFirst: number; toolsOfferedMax: number; systemPromptChars: number; errors: string[] };
  reply: string;
  pendingActions: { toolName: string; status: string; final: boolean }[];
};

export type EvalReport = {
  meta: {
    startedAt: string;
    finishedAt: string;
    model: string;
    gitSha: string | null;
    argv: string[];
    filter: string | null;
    locales: string[] | null;
    repeat: number;
    concurrency: number;
    env: Record<string, string>;
    prices: Prices;
    blockedCalls: string[];
  };
  summary: Summary;
  results: CaseResult[];
};

export type Prices = { inputMissPerM: number; inputHitPerM: number; outputPerM: number };

export function pricesFromEnv(): Prices {
  const num = (raw: string | undefined, fallback: number) => {
    const value = Number.parseFloat(raw ?? '');
    return Number.isFinite(value) ? value : fallback;
  };
  // DeepSeek list prices (USD / 1M tokens) for deepseek-chat class models; override via env.
  return {
    inputMissPerM: num(process.env.EVAL_PRICE_INPUT_MISS_PER_M, 0.28),
    inputHitPerM: num(process.env.EVAL_PRICE_INPUT_HIT_PER_M, 0.028),
    outputPerM: num(process.env.EVAL_PRICE_OUTPUT_PER_M, 0.42),
  };
}

export type Summary = {
  cases: number;
  attempts: number;
  passed: number;
  passRate: number;
  byArea: Record<string, { attempts: number; passed: number; passRate: number }>;
  byLocale: Record<string, { attempts: number; passed: number; passRate: number }>;
  byCheck: Record<string, { evaluated: number; failed: number; caseIds: string[] }>;
  flaky: { id: string; passed: number; attempts: number }[];
  tokens: { input: number; output: number; cacheHit: number; cacheMiss: number; avgInputPerAttempt: number; avgOutputPerAttempt: number; cacheHitRatio: number };
  latency: { p50: number; p95: number; avg: number };
  steps: { avg: number; max: number };
  toolsOfferedFirstAvg: number;
  estimatedCostUsd: number;
  errors: number;
  /** `tool:error` → count over all attempts (invalid_arguments, not_found, unknown_tool, ...). */
  toolErrors: Record<string, number>;
};

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export function summarize(results: CaseResult[], prices: Prices): Summary {
  const group = (key: (r: CaseResult) => string) => {
    const out: Record<string, { attempts: number; passed: number; passRate: number }> = {};
    for (const r of results) {
      const k = key(r);
      out[k] ??= { attempts: 0, passed: 0, passRate: 0 };
      out[k].attempts += 1;
      if (r.pass) out[k].passed += 1;
    }
    for (const v of Object.values(out)) v.passRate = pct(v.passed, v.attempts);
    return out;
  };
  const byCheck: Summary['byCheck'] = {};
  for (const r of results) {
    for (const c of r.checks) {
      const name = c.name.startsWith('reply:') ? 'reply' : c.name;
      byCheck[name] ??= { evaluated: 0, failed: 0, caseIds: [] };
      if (c.ok === null) continue;
      byCheck[name].evaluated += 1;
      if (c.ok === false) {
        byCheck[name].failed += 1;
        if (!byCheck[name].caseIds.includes(r.id)) byCheck[name].caseIds.push(r.id);
      }
    }
  }
  const perCase = new Map<string, { passed: number; attempts: number }>();
  for (const r of results) {
    const entry = perCase.get(r.id) ?? { passed: 0, attempts: 0 };
    entry.attempts += 1;
    if (r.pass) entry.passed += 1;
    perCase.set(r.id, entry);
  }
  const flaky = [...perCase.entries()]
    .filter(([, v]) => v.attempts > 1 && v.passed > 0 && v.passed < v.attempts)
    .map(([id, v]) => ({ id, ...v }));
  const sum = (f: (r: CaseResult) => number) => results.reduce((acc, r) => acc + f(r), 0);
  const input = sum((r) => r.tokens.input);
  const output = sum((r) => r.tokens.output);
  const cacheHit = sum((r) => r.tokens.cacheHit);
  const cacheMiss = sum((r) => r.tokens.cacheMiss || Math.max(0, r.tokens.input - r.tokens.cacheHit));
  const latencies = results.map((r) => r.latencyMs);
  const passed = results.filter((r) => r.pass).length;
  return {
    cases: perCase.size,
    attempts: results.length,
    passed,
    passRate: pct(passed, results.length),
    byArea: group((r) => r.area),
    byLocale: group((r) => r.locale),
    byCheck,
    flaky,
    tokens: {
      input,
      output,
      cacheHit,
      cacheMiss,
      avgInputPerAttempt: Math.round(input / Math.max(1, results.length)),
      avgOutputPerAttempt: Math.round(output / Math.max(1, results.length)),
      cacheHitRatio: pct(cacheHit, cacheHit + cacheMiss),
    },
    latency: { p50: quantile(latencies, 0.5), p95: quantile(latencies, 0.95), avg: Math.round(sum((r) => r.latencyMs) / Math.max(1, results.length)) },
    steps: { avg: Math.round((sum((r) => r.steps) / Math.max(1, results.length)) * 10) / 10, max: Math.max(0, ...results.map((r) => r.steps)) },
    toolsOfferedFirstAvg: Math.round(sum((r) => r.llm.toolsOfferedFirst) / Math.max(1, results.length)),
    estimatedCostUsd:
      Math.round(((cacheMiss * prices.inputMissPerM + cacheHit * prices.inputHitPerM + output * prices.outputPerM) / 1_000_000) * 10000) / 10000,
    errors: results.filter((r) => r.error).length,
    toolErrors: results
      .flatMap((r) => r.tools.filter((t) => t.ok === false).map((t) => `${t.name}:${t.error}`))
      .reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {}),
  };
}

function pad(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

export function printTable(results: CaseResult[]): void {
  const header = `${pad('case', 36)} ${pad('res', 4)} ${pad('failed checks', 34)} ${pad('tools', 46)} ${pad('st', 3)} ${pad('in/out/cache', 18)} ${pad('ms', 6)}`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const r of results) {
    const tools = r.tools.map((t) => (t.ok === false ? `${t.name}!` : t.name)).join(',') || '-';
    const tokens = `${r.tokens.input}/${r.tokens.output}/${r.tokens.cacheHit}`;
    const id = r.attempt > 1 ? `${r.id}#${r.attempt}` : r.id;
    console.log(
      `${pad(id, 36)} ${pad(r.pass ? 'PASS' : 'FAIL', 4)} ${pad(r.error ? `ERROR ${r.error}` : r.failed.join(',') || '-', 34)} ${pad(tools, 46)} ${pad(String(r.steps), 3)} ${pad(tokens, 18)} ${pad(String(r.latencyMs), 6)}`,
    );
  }
}

export function printSummary(summary: Summary, results: CaseResult[]): void {
  console.log('');
  console.log(`Pass rate: ${summary.passed}/${summary.attempts} = ${summary.passRate}%  (cases ${summary.cases}, errors ${summary.errors})`);
  const line = (label: string, groups: Summary['byArea']) =>
    console.log(`${label}: ${Object.entries(groups).map(([k, v]) => `${k} ${v.passed}/${v.attempts}`).join('  ')}`);
  line('By area', summary.byArea);
  line('By locale', summary.byLocale);
  console.log('Failing checks:');
  const checks = Object.entries(summary.byCheck).filter(([, v]) => v.failed > 0).sort((a, b) => b[1].failed - a[1].failed);
  if (checks.length === 0) console.log('  none');
  for (const [name, v] of checks) console.log(`  ${pad(name, 22)} ${v.failed}/${v.evaluated}  ${v.caseIds.join(', ')}`);
  const toolErrors = Object.entries(summary.toolErrors ?? {}).sort((a, b) => b[1] - a[1]);
  if (toolErrors.length) console.log(`Tool errors: ${toolErrors.map(([k, v]) => `${k} x${v}`).join(', ')}`);
  if (summary.flaky.length) console.log(`Flaky: ${summary.flaky.map((f) => `${f.id} ${f.passed}/${f.attempts}`).join(', ')}`);
  const t = summary.tokens;
  console.log(
    `Tokens: input ${t.input} (cache hit ${t.cacheHit}, ${t.cacheHitRatio}%), output ${t.output}; per attempt ${t.avgInputPerAttempt} in / ${t.avgOutputPerAttempt} out; tools offered on step 1: ${summary.toolsOfferedFirstAvg}`,
  );
  console.log(`Latency (final turn): p50 ${summary.latency.p50} ms, p95 ${summary.latency.p95} ms, avg ${summary.latency.avg} ms; steps avg ${summary.steps.avg}, max ${summary.steps.max}`);
  const endReasons = new Map<string, number>();
  for (const r of results) if (r.endReason) endReasons.set(r.endReason, (endReasons.get(r.endReason) ?? 0) + 1);
  if (endReasons.size) console.log(`End reasons: ${[...endReasons.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`Estimated cost: $${summary.estimatedCostUsd.toFixed(4)} (prices per 1M: EVAL_PRICE_INPUT_MISS_PER_M / _HIT_ / EVAL_PRICE_OUTPUT_PER_M)`);
}

export function printComparison(current: EvalReport, previousPath: string): void {
  const previous = JSON.parse(fs.readFileSync(previousPath, 'utf8')) as EvalReport;
  const a = previous.summary;
  const b = current.summary;
  const delta = (x: number, y: number, unit = '') => {
    const digits = Math.abs(x) < 1 && Math.abs(y) < 1 ? 4 : 1;
    const factor = 10 ** digits;
    return `${x}${unit} -> ${y}${unit} (${y - x >= 0 ? '+' : ''}${Math.round((y - x) * factor) / factor}${unit})`;
  };
  console.log('');
  console.log(`Compare with ${previousPath} (${previous.meta.startedAt}, env ${JSON.stringify(previous.meta.env)})`);
  console.log(`  pass rate        ${delta(a.passRate, b.passRate, '%')}`);
  console.log(`  input/attempt    ${delta(a.tokens.avgInputPerAttempt, b.tokens.avgInputPerAttempt)}`);
  console.log(`  output/attempt   ${delta(a.tokens.avgOutputPerAttempt, b.tokens.avgOutputPerAttempt)}`);
  console.log(`  cache hit ratio  ${delta(a.tokens.cacheHitRatio, b.tokens.cacheHitRatio, '%')}`);
  console.log(`  tools offered    ${delta(a.toolsOfferedFirstAvg, b.toolsOfferedFirstAvg)}`);
  console.log(`  latency p50      ${delta(a.latency.p50, b.latency.p50, 'ms')}`);
  console.log(`  latency p95      ${delta(a.latency.p95, b.latency.p95, 'ms')}`);
  console.log(`  steps avg        ${delta(a.steps.avg, b.steps.avg)}`);
  console.log(`  cost (USD)       ${delta(a.estimatedCostUsd, b.estimatedCostUsd)}`);
  const rate = (results: CaseResult[]) => {
    const map = new Map<string, { passed: number; attempts: number }>();
    for (const r of results) {
      const e = map.get(r.id) ?? { passed: 0, attempts: 0 };
      e.attempts += 1;
      if (r.pass) e.passed += 1;
      map.set(r.id, e);
    }
    return map;
  };
  const before = rate(previous.results);
  const after = rate(current.results);
  const regressions: string[] = [];
  const fixes: string[] = [];
  for (const [id, now] of after) {
    const was = before.get(id);
    if (!was) continue;
    const r0 = was.passed / was.attempts;
    const r1 = now.passed / now.attempts;
    if (r1 < r0) regressions.push(`${id} ${was.passed}/${was.attempts}->${now.passed}/${now.attempts}`);
    if (r1 > r0) fixes.push(`${id} ${was.passed}/${was.attempts}->${now.passed}/${now.attempts}`);
  }
  console.log(`  regressions (${regressions.length}): ${regressions.join(', ') || '-'}`);
  console.log(`  fixed (${fixes.length}): ${fixes.join(', ') || '-'}`);
}
