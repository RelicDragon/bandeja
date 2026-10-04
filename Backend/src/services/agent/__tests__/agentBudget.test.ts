/**
 * Phase 5 (pure, no DB): per-user daily budget resolution (`agentBudget.service.ts`: per-user
 * override → admin tier → user tier, PlatformSetting rows over env, malformed rows ignored)
 * and the admin cost dashboard pricing (`agentCost.ts`).
 */
import assert from 'node:assert/strict';
import { resolveAgentEnvConfig } from '../../../config/agentEnv';
import {
  AGENT_BUDGET_MAX_TOKENS,
  parseAgentBudgetTokens,
  parseAgentUserBudgetOverrides,
  resolveAgentBudgetTiers,
  resolveAgentDailyBudget,
} from '../agentBudget.service';
import {
  AGENT_DEFAULT_PRICES,
  agentCostUsd,
  agentPriceFor,
  parseAgentPriceTable,
  resolveAgentPriceTable,
  roundUsd,
} from '../agentCost';
import { AGENT_METERED_USAGE_REASONS } from '../agentGuards';

const reader = (rows: Record<string, string>) => async (key: string) => rows[key] ?? null;

void (async () => {
  // --- env ---------------------------------------------------------------------------------------
  const defaults = resolveAgentEnvConfig({});
  assert.equal(defaults.dailyTokenBudget, 1_500_000);
  assert.equal(defaults.adminDailyTokenBudget, 10_000_000, 'admins: higher by default, not unlimited');
  assert.equal(defaults.pricesJson, null);
  const env = resolveAgentEnvConfig({ AGENT_DAILY_TOKEN_BUDGET: '1000', AGENT_ADMIN_DAILY_TOKEN_BUDGET: '5000', AGENT_PRICES_USD_PER_MTOK: ' {"a":{"input":1}} ' });
  assert.deepEqual([env.dailyTokenBudget, env.adminDailyTokenBudget, env.pricesJson], [1000, 5000, '{"a":{"input":1}}']);

  // --- parsing -----------------------------------------------------------------------------------
  assert.equal(parseAgentBudgetTokens('250000'), 250_000);
  assert.equal(parseAgentBudgetTokens(' 0 '), 0, '0 = paused');
  assert.equal(parseAgentBudgetTokens('12.9'), 12);
  assert.equal(parseAgentBudgetTokens('1e12'), AGENT_BUDGET_MAX_TOKENS, 'capped');
  for (const bad of ['', ' ', '-1', 'lots', null, undefined, Number.NaN, {}]) {
    assert.equal(parseAgentBudgetTokens(bad), null, `invalid: ${String(bad)}`);
  }
  assert.deepEqual([...parseAgentUserBudgetOverrides('{"u1": 100, "u2": "200", "u3": -5, "u4": "x", " ": 1}')], [['u1', 100], ['u2', 200]]);
  for (const bad of [null, '', 'not json', '[1,2]', '42', 'null']) {
    assert.equal(parseAgentUserBudgetOverrides(bad).size, 0, `invalid overrides: ${String(bad)}`);
  }

  // --- resolution order --------------------------------------------------------------------------
  const base = { dailyTokenBudget: 1000, adminDailyTokenBudget: 5000 };
  const none = reader({});
  assert.deepEqual(await resolveAgentDailyBudget('u1', base, { isAdmin: false, read: none }), { tokens: 1000, source: 'user' });
  assert.deepEqual(await resolveAgentDailyBudget('u1', base, { isAdmin: true, read: none }), { tokens: 5000, source: 'admin' });
  const rows = reader({
    AGENT_DAILY_TOKEN_BUDGET: '2000',
    AGENT_ADMIN_DAILY_TOKEN_BUDGET: '9000',
    AGENT_USER_DAILY_TOKEN_BUDGETS: JSON.stringify({ vip: 50_000, banned: 0, admin1: 10 }),
  });
  assert.deepEqual(await resolveAgentDailyBudget('u1', base, { isAdmin: false, read: rows }), { tokens: 2000, source: 'user' }, 'row wins over env');
  assert.deepEqual(await resolveAgentDailyBudget('u1', base, { isAdmin: true, read: rows }), { tokens: 9000, source: 'admin' });
  assert.deepEqual(await resolveAgentDailyBudget('vip', base, { isAdmin: false, read: rows }), { tokens: 50_000, source: 'override' });
  assert.deepEqual(await resolveAgentDailyBudget('banned', base, { isAdmin: false, read: rows }), { tokens: 0, source: 'override' });
  assert.deepEqual(await resolveAgentDailyBudget('admin1', base, { isAdmin: true, read: rows }), { tokens: 10, source: 'override' }, 'an override beats the admin tier');
  const malformed = reader({ AGENT_DAILY_TOKEN_BUDGET: 'lots', AGENT_ADMIN_DAILY_TOKEN_BUDGET: '-3', AGENT_USER_DAILY_TOKEN_BUDGETS: '{oops' });
  assert.deepEqual(await resolveAgentDailyBudget('vip', base, { isAdmin: false, read: malformed }), { tokens: 1000, source: 'user' }, 'malformed rows fall back to env');
  assert.deepEqual(await resolveAgentDailyBudget('vip', base, { isAdmin: true, read: malformed }), { tokens: 5000, source: 'admin' });
  const failing = async () => {
    throw new Error('db down');
  };
  assert.deepEqual(await resolveAgentDailyBudget('u1', base, { isAdmin: false, read: failing }), { tokens: 1000, source: 'user' }, 'a settings outage falls back to env');
  assert.deepEqual(await resolveAgentBudgetTiers(base, rows), { user: 2000, admin: 9000, overrides: 3 });
  assert.deepEqual(await resolveAgentBudgetTiers(base, none), { user: 1000, admin: 5000, overrides: 0 });

  // --- pricing -----------------------------------------------------------------------------------
  assert.equal(parseAgentPriceTable('nope'), null);
  assert.equal(parseAgentPriceTable('{"a":{"output":1}}'), null, 'input price required');
  assert.deepEqual(parseAgentPriceTable('{"a":{"input":1,"cachedInput":-1,"output":2},"b":5}'), { a: { input: 1, output: 2 } });
  assert.equal(resolveAgentPriceTable('{"s":{"input":1}}', '{"e":{"input":1}}').source, 'setting');
  assert.equal(resolveAgentPriceTable('broken', '{"e":{"input":1}}').source, 'env');
  assert.deepEqual(resolveAgentPriceTable(null, null), { source: 'default', table: AGENT_DEFAULT_PRICES });

  const table = {
    'deepseek-*': { input: 1, cachedInput: 0.1, output: 2 },
    'deepseek-flash-*': { input: 3 },
    'deepseek-exact': { input: 7 },
    agent_web_search: { input: 8 },
  };
  const priceOf = (model: string, reason: string | null) => agentPriceFor(table, { model, reason }, AGENT_METERED_USAGE_REASONS);
  assert.deepEqual(priceOf('deepseek-exact', 'agent_chat'), { input: 7 }, 'exact model first');
  assert.deepEqual(priceOf('deepseek-flash-2', 'agent_chat'), { input: 3 }, 'longest prefix wins');
  assert.deepEqual(priceOf('deepseek-chat', 'agent_chat_summary'), table['deepseek-*']);
  assert.deepEqual(priceOf('live', 'agent_web_search'), { input: 8 }, 'metered rows priced by reason');
  assert.equal(priceOf('deepseek-chat', 'agent_web_fetch'), null, 'a metered reason never falls back to the model price');
  assert.equal(priceOf('gpt-x', 'agent_chat'), null);

  // 600k miss × 1 + 400k hit × 0.1 + 100k out × 2 = 0.84 USD
  assert.equal(roundUsd(agentCostUsd({ inputTokens: 1_000_000, cachedInputTokens: 400_000, outputTokens: 100_000 }, table['deepseek-*'])!), 0.84);
  assert.equal(roundUsd(agentCostUsd({ inputTokens: 1000, cachedInputTokens: 5000, outputTokens: 0 }, { input: 1, cachedInput: 0.5 })!), 0.0005, 'cached capped at input');
  assert.equal(roundUsd(agentCostUsd({ inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000 }, { input: 2 })!), 4, 'output defaults to the input price');
  assert.equal(agentCostUsd({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }, null), null);

  console.log('agentBudget.test.ts: ok');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
