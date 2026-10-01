/**
 * Web search chain (no network; port of travel-bandeja `webSearchChain.test.js` plus the
 * PadelPulse rotation, `admit` and abort cases; docs/plans/ai-agent-web-search.md §13.13).
 * Each test builds its own chain instance, so no shared state leaks between tests.
 */
import assert from 'node:assert/strict';
import { createWebSearchChain } from '../search/webSearchChain';
import type { AgentWebEnvConfig } from '../../../../config/agentWebEnv';
import {
  BRAVE_OK,
  DDG_OK,
  RATE_LIMITED,
  TAVILY_OK,
  createSuite,
  makeClock,
  makeRouterFetch,
  testEnv,
  type ScriptedResponse,
} from './webTestUtils';

const suite = createSuite('webSearchChain.test.ts');
const { test } = suite;

const quiet = () => undefined;

function chainWith(
  routes: Parameters<typeof makeRouterFetch>[0],
  envOverrides: Record<string, string | undefined> = {},
  now = makeClock(),
) {
  const router = makeRouterFetch(routes);
  let env: AgentWebEnvConfig = testEnv(envOverrides);
  const chain = createWebSearchChain({ env: () => env, fetchImpl: router.fetchImpl, now, log: quiet });
  return { chain, calls: router.calls, now, setEnv: (o: Record<string, string | undefined>) => { env = testEnv(o); } };
}

const many = (r: ScriptedResponse, n = 6) => Array.from({ length: n }, () => r);

test('lru rotation alternates Tavily and Brave across queries', async () => {
  const { chain, calls } = chainWith({ tavily: many(TAVILY_OK), brave: many(BRAVE_OK) });
  const providers: (string | null)[] = [];
  for (const q of ['q1', 'q2', 'q3', 'q4']) providers.push((await chain.search(q)).provider);
  assert.deepEqual(providers, ['tavily', 'brave', 'tavily', 'brave']);
  assert.equal(calls.tavily.length, 2);
  assert.equal(calls.brave.length, 2);
});

test('ordered rotation = first healthy wins (travel-bandeja)', async () => {
  const { chain, calls } = chainWith({ tavily: many(TAVILY_OK), brave: many(BRAVE_OK) }, { AGENT_WEB_SEARCH_ROTATION: 'ordered' });
  for (const q of ['q1', 'q2', 'q3']) assert.equal((await chain.search(q)).provider, 'tavily');
  assert.equal(calls.brave.length, 0);
});

test('custom order: brave first', async () => {
  const { chain } = chainWith({ tavily: many(TAVILY_OK), brave: many(BRAVE_OK) }, { AGENT_WEB_SEARCH_PROVIDER_ORDER: 'brave,tavily' });
  assert.equal((await chain.search('q1')).provider, 'brave');
  assert.equal((await chain.search('q2')).provider, 'tavily');
});

test('fails over on 429, cools the provider, skips it next time', async () => {
  const { chain, calls, now } = chainWith({ tavily: [RATE_LIMITED(9999), TAVILY_OK], brave: many(BRAVE_OK) });
  const first = await chain.search('porto');
  assert.equal(first.provider, 'brave');
  assert.deepEqual(first.tried, [{ provider: 'tavily', error: 'rate_limited' }]);
  const second = await chain.search('lisbon');
  assert.equal(second.provider, 'brave');
  assert.deepEqual(second.tried, [], 'the healthy provider goes first; the cooling one is never reached');
  assert.equal(calls.tavily.length, 1, 'cooling provider never called');
  now.advance(15 * 60_000 + 1);
  assert.equal((await chain.search('faro')).provider, 'tavily', 'recovered after the Retry-After window');
});

test('5xx then 429 on keyed providers → DDG last resort only when enabled', async () => {
  const off = chainWith({ tavily: [{ status: 500 }], brave: [RATE_LIMITED()], duckduckgo: [DDG_OK] });
  const r1 = await off.chain.search('evora');
  assert.equal(r1.provider, null);
  assert.equal(r1.exhausted, true);
  assert.equal(off.calls.duckduckgo.length, 0, 'DDG off by default');
  const on = chainWith({ tavily: [{ status: 500 }], brave: [RATE_LIMITED()], duckduckgo: [DDG_OK] }, { AGENT_WEB_SEARCH_DDG_ENABLED: 'true' });
  const r2 = await on.chain.search('evora');
  assert.equal(r2.provider, 'duckduckgo');
  assert.equal(r2.results[0].url, 'https://ddg.example.org/r');
  assert.deepEqual(r2.tried.map((t) => t.provider), ['tavily', 'brave']);
});

test('DDG is never rotated in front of a healthy keyed provider', async () => {
  const { chain, calls } = chainWith({ tavily: many(TAVILY_OK), brave: many(BRAVE_OK), duckduckgo: many(DDG_OK) }, { AGENT_WEB_SEARCH_DDG_ENABLED: 'true' });
  for (const q of ['a1', 'a2', 'a3', 'a4', 'a5']) await chain.search(q);
  assert.equal(calls.duckduckgo.length, 0);
});

test('empty results rotate to the next provider; all empty is not exhausted', async () => {
  const a = chainWith({ tavily: [{ json: { results: [] } }], brave: [BRAVE_OK] });
  const r = await a.chain.search('empty-then-brave');
  assert.equal(r.provider, 'brave');
  assert.ok(r.tried.some((t) => t.provider === 'tavily' && t.skipped === 'empty_results'));
  const b = chainWith({ tavily: [{ json: { results: [] } }], brave: [{ json: { web: { results: [] } } }] });
  const miss = await b.chain.search('genuine-miss');
  assert.equal(miss.exhausted, false);
  assert.equal(miss.provider, null);
  assert.deepEqual(miss.results, []);
});

test('tried entries carry kinds only, never messages', async () => {
  const { chain } = chainWith({ tavily: [{ status: 429 }], brave: [{ status: 500 }] });
  const res = await chain.search('leak-check');
  assert.equal(res.exhausted, true);
  for (const t of res.tried) {
    assert.deepEqual(Object.keys(t).sort(), ['error', 'provider']);
  }
});

test('a one-off 400 does not cool the provider', async () => {
  const { chain, calls } = chainWith(
    { tavily: [{ status: 400 }, TAVILY_OK], brave: many(BRAVE_OK) },
    { AGENT_WEB_SEARCH_ROTATION: 'ordered' },
  );
  assert.equal((await chain.search('bad-shape')).provider, 'brave');
  assert.equal((await chain.search('good-shape')).provider, 'tavily');
  assert.equal(calls.tavily.length, 2);
});

test('cache: hit skips the chain; failures and empties are not cached', async () => {
  const { chain, calls } = chainWith({ tavily: [TAVILY_OK, { status: 500 }], brave: [{ status: 500 }, { status: 500 }] });
  const first = await chain.search('Padel  Rules', { count: 3 });
  const second = await chain.search('padel rules', { count: 3 });
  assert.equal(first.cached, undefined);
  assert.equal(second.cached, true);
  assert.equal(second.provider, 'tavily');
  assert.equal(calls.tavily.length, 1);
  const differentCount = await chain.search('padel rules', { count: 4 });
  assert.equal(differentCount.cached, undefined, 'count is part of the key');
  const again = await chain.search('padel rules', { count: 4 });
  assert.equal(again.cached, undefined, 'exhausted result never cached');
});

test('cache expires after the TTL', async () => {
  const { chain, now, calls } = chainWith({ tavily: many(TAVILY_OK), brave: many(BRAVE_OK) }, { AGENT_WEB_SEARCH_CACHE_TTL_MS: '1000' });
  await chain.search('ttl');
  assert.equal((await chain.search('ttl')).cached, true);
  now.advance(1001);
  assert.equal((await chain.search('ttl')).cached, undefined);
  assert.equal(calls.tavily.length + calls.brave.length, 2);
});

test('single-flight: concurrent identical queries share one provider call', async () => {
  let tavilyCalls = 0;
  const fetchImpl = async (url: string) => {
    if (url.includes('tavily.com')) {
      tavilyCalls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return new Response(JSON.stringify(TAVILY_OK.json));
    }
    return new Response('{}', { status: 500 });
  };
  const chain = createWebSearchChain({ env: () => testEnv(), fetchImpl, log: quiet });
  const [a, b] = await Promise.all([chain.search('concurrent'), chain.search('concurrent')]);
  assert.equal(a.provider, 'tavily');
  assert.equal(b.provider, 'tavily');
  assert.equal(b.joined, true);
  assert.equal(tavilyCalls, 1);
});

test('admit=false → rateLimited, no network, nothing cached; admit only on a miss', async () => {
  const { chain, calls } = chainWith({ tavily: many(TAVILY_OK), brave: many(BRAVE_OK) });
  const refused = await chain.search('limited', { admit: async () => false });
  assert.equal(refused.rateLimited, true);
  assert.equal(calls.tavily.length + calls.brave.length, 0);
  let admits = 0;
  const admit = async () => {
    admits += 1;
    return true;
  };
  await chain.search('limited', { admit });
  await chain.search('limited', { admit });
  assert.equal(admits, 1, 'a cache hit does not consume the global limit');
});

test('the chain is bounded by the total timeout when every provider hangs', async () => {
  const hang = (_url: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      const sig = init?.signal;
      const fail = () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
      if (sig?.aborted) return fail();
      sig?.addEventListener('abort', fail, { once: true });
    });
  const chain = createWebSearchChain({
    env: () => testEnv({ AGENT_WEB_SEARCH_TOTAL_TIMEOUT_MS: '1000', AGENT_WEB_SEARCH_TIMEOUT_MS: '5000' }),
    fetchImpl: hang,
    log: quiet,
  });
  const start = Date.now();
  const res = await chain.search('hang');
  assert.equal(res.exhausted, true);
  assert.ok(Date.now() - start < 2500, 'bounded by the deadline');
  assert.ok(res.tried.length >= 1);
});

test('a cancelled run stops the chain and cools nothing', async () => {
  const controller = new AbortController();
  const fetchImpl = (_url: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      setTimeout(() => controller.abort(), 5);
    });
  const chain = createWebSearchChain({ env: () => testEnv(), fetchImpl, log: quiet });
  const res = await chain.search('cancel-me', { signal: controller.signal });
  assert.equal(res.provider, null);
  assert.equal(chain.health.isHealthy('tavily'), true);
  assert.equal(chain.health.isHealthy('brave'), true);
});

test('disabled: kill switch or no keyed provider; empty query', async () => {
  const { chain, calls, setEnv } = chainWith({ tavily: many(TAVILY_OK) }, { AGENT_WEB_SEARCH_ENABLED: 'false' });
  const off = await chain.search('q');
  assert.equal(off.disabled, true);
  assert.equal(chain.isConfigured(), false);
  setEnv({ TAVILY_API_KEY: '', BRAVE_SEARCH_API_KEY: '', AGENT_WEB_SEARCH_DDG_ENABLED: 'true' });
  assert.equal((await chain.search('q')).disabled, true, 'DDG alone is not "configured"');
  setEnv({});
  assert.equal((await chain.search('   ')).error, 'empty_query');
  assert.equal(calls.tavily.length, 0);
});

test('unconfigured provider skipped; status() exposes no keys', async () => {
  const { chain, calls } = chainWith({ tavily: many(TAVILY_OK), brave: many(BRAVE_OK) }, { BRAVE_SEARCH_API_KEY: '' });
  const r1 = await chain.search('x1');
  const r2 = await chain.search('x2');
  assert.equal(r1.provider, 'tavily');
  assert.equal(r2.provider, 'tavily');
  assert.ok(r2.tried.some((t) => t.provider === 'brave' && t.skipped === 'unconfigured'));
  assert.equal(calls.brave.length, 0);
  const status = chain.status();
  assert.deepEqual(status.map((s) => [s.name, s.configured]), [['tavily', true], ['brave', false]]);
  assert.ok(!JSON.stringify(status).includes('test-tavily-key'));
});

void suite.run();
