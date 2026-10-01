/**
 * Web search building blocks (no network): error model, circuit breaker, rotation, TTL
 * cache, URL helpers, provider adapters (docs/plans/ai-agent-web-search.md §13.13).
 */
import assert from 'node:assert/strict';
import { resolveAgentWebEnvConfig, isAgentWebSearchOn, isAgentWebFetchOn } from '../../../../config/agentWebEnv';
import { TtlCache } from '../webTtlCache';
import { canonicalizeUrl, displayHost, extractUrlsFromText, safeHttpUrl } from '../webUrl';
import { ProviderHealthTracker, MAX_COOLDOWN_MS } from '../search/providerHealth';
import { ProviderRotation } from '../search/providerRotation';
import { clampCount, normalizeResults, trimSnippet, MAX_SNIPPET_CHARS } from '../search/providerUtils';
import { braveProvider } from '../search/providers/brave';
import { duckDuckGoProvider, parseDuckDuckGoHtml } from '../search/providers/duckDuckGo';
import { tavilyProvider } from '../search/providers/tavily';
import { WebSearchError, classifyError, classifyHttpError, parseRetryAfter } from '../search/webSearchError';
import { createSuite, makeClock, makeRouterFetch, testEnv, BRAVE_OK, TAVILY_OK } from './webTestUtils';

const suite = createSuite('webSearchBasics.test.ts');
const { test } = suite;

// --- env -------------------------------------------------------------------------------------

test('env: on with one key, kill switch, DDG alone never turns it on', () => {
  assert.equal(isAgentWebSearchOn(testEnv()), true);
  assert.equal(isAgentWebSearchOn(testEnv({ TAVILY_API_KEY: '' })), true, 'Brave alone');
  assert.equal(isAgentWebSearchOn(testEnv({ TAVILY_API_KEY: '', BRAVE_SEARCH_API_KEY: '' })), false);
  assert.equal(
    isAgentWebSearchOn(testEnv({ TAVILY_API_KEY: '', BRAVE_SEARCH_API_KEY: '', AGENT_WEB_SEARCH_DDG_ENABLED: 'true' })),
    false,
  );
  for (const off of ['false', '0', 'off', 'FALSE']) {
    assert.equal(isAgentWebSearchOn(testEnv({ AGENT_WEB_SEARCH_ENABLED: off })), false, off);
  }
  assert.equal(isAgentWebFetchOn(testEnv({ AGENT_WEB_FETCH_ENABLED: 'false' })), false);
  assert.equal(isAgentWebFetchOn(testEnv()), true);
});

test('env: provider order keeps tavily/brave only, deduped; rotation and caps', () => {
  const env = resolveAgentWebEnvConfig({ AGENT_WEB_SEARCH_PROVIDER_ORDER: 'brave, duckduckgo, brave, bing, tavily' } as NodeJS.ProcessEnv);
  assert.deepEqual(env.providerOrder, ['brave', 'tavily']);
  assert.deepEqual(resolveAgentWebEnvConfig({} as NodeJS.ProcessEnv).providerOrder, ['tavily', 'brave']);
  assert.equal(resolveAgentWebEnvConfig({} as NodeJS.ProcessEnv).rotation, 'lru');
  assert.equal(resolveAgentWebEnvConfig({ AGENT_WEB_SEARCH_ROTATION: 'ordered' } as NodeJS.ProcessEnv).rotation, 'ordered');
  assert.equal(resolveAgentWebEnvConfig({ AGENT_WEB_FETCH_MAX_CHARS: '999999' } as NodeJS.ProcessEnv).fetchMaxChars, 12_000);
  assert.equal(resolveAgentWebEnvConfig({} as NodeJS.ProcessEnv).ddgEnabled, false);
});

// --- error model -----------------------------------------------------------------------------

test('parseRetryAfter: seconds, HTTP date, caps, garbage', () => {
  const now = () => Date.parse('2026-10-01T10:00:00Z');
  assert.equal(parseRetryAfter('5', now), 5000);
  assert.equal(parseRetryAfter('0.2', now), 1000);
  assert.equal(parseRetryAfter('99999', now), 15 * 60_000);
  assert.equal(parseRetryAfter('Thu, 01 Oct 2026 10:00:30 GMT', now), 30_000);
  assert.equal(parseRetryAfter('Thu, 01 Oct 2026 09:00:00 GMT', now), 0);
  assert.equal(parseRetryAfter('soon', now), null);
  assert.equal(parseRetryAfter(undefined, now), null);
});

test('classifyHttpError / classifyError', () => {
  assert.deepEqual(classifyHttpError(429, new Headers({ 'retry-after': '7' })), { kind: 'rate_limited', retryAfterMs: 7000 });
  assert.deepEqual(classifyHttpError(429, { 'Retry-After': '2' }), { kind: 'rate_limited', retryAfterMs: 2000 });
  assert.equal(classifyHttpError(401).kind, 'auth');
  assert.equal(classifyHttpError(403).kind, 'auth');
  assert.equal(classifyHttpError(502).kind, 'server');
  assert.equal(classifyHttpError(400).kind, 'unknown');
  assert.equal(classifyError(new WebSearchError('x', { kind: 'server' })).kind, 'server');
  assert.equal(classifyError(Object.assign(new Error('aborted'), { name: 'AbortError' })).kind, 'network');
  assert.equal(classifyError(Object.assign(new Error('x'), { name: 'TimeoutError' })).kind, 'network');
  assert.equal(classifyError(new Error('boom')).kind, 'unknown');
});

// --- circuit breaker -------------------------------------------------------------------------

test('health: cooldown per kind, recovery, Retry-After wins, success resets', () => {
  const now = makeClock();
  const h = new ProviderHealthTracker(now);
  assert.equal(h.isHealthy('tavily'), true);
  h.recordFailure('brave', { kind: 'rate_limited' });
  assert.equal(h.isHealthy('brave'), false);
  now.advance(59_999);
  assert.equal(h.isHealthy('brave'), false);
  now.advance(2);
  assert.equal(h.isHealthy('brave'), true);
  h.recordFailure('tavily', { kind: 'rate_limited', retryAfterMs: 5_000 });
  now.advance(5_001);
  assert.equal(h.isHealthy('tavily'), true, 'Retry-After overrides the 60 s base');
  h.recordFailure('tavily', { kind: 'auth' });
  assert.equal(h.snapshot('tavily').lastError, 'auth');
  assert.equal(h.snapshot('tavily').cooldownUntil - now(), 2 * 5 * 60_000, 'second consecutive failure doubles');
  h.recordSuccess('tavily');
  assert.equal(h.isHealthy('tavily'), true);
  assert.equal(h.snapshot('tavily').consecutiveFailures, 0);
});

test('health: backoff grows, capped at 15 min; providers independent; snapshot is a copy', () => {
  const now = makeClock();
  const h = new ProviderHealthTracker(now);
  const lengths: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    h.recordFailure('brave', { kind: 'server' });
    lengths.push(h.snapshot('brave').cooldownUntil - now());
  }
  assert.deepEqual(lengths.slice(0, 5), [30_000, 60_000, 90_000, 120_000, 150_000]);
  assert.equal(lengths[7], 150_000, 'factor capped at 5');
  h.recordFailure('tavily', { kind: 'auth' });
  for (let i = 0; i < 6; i += 1) h.recordFailure('tavily', { kind: 'auth' });
  assert.equal(h.snapshot('tavily').cooldownUntil - now(), MAX_COOLDOWN_MS);
  assert.equal(h.isHealthy('duckduckgo'), true);
  const snap = h.snapshot('brave');
  snap.consecutiveFailures = 999;
  assert.equal(h.snapshot('brave').consecutiveFailures, 8);
  h.clear();
  assert.equal(h.isHealthy('brave'), true);
});

// --- rotation --------------------------------------------------------------------------------

test('rotation: lru alternates, ordered keeps order, cooling go last', () => {
  const r = new ProviderRotation();
  const healthy = () => true;
  const picks: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const first = r.order(['tavily', 'brave'], 'lru', healthy)[0];
    r.markAttempt(first);
    picks.push(first);
  }
  assert.deepEqual(picks, ['tavily', 'brave', 'tavily', 'brave']);
  assert.deepEqual(r.order(['tavily', 'brave'], 'ordered', healthy), ['tavily', 'brave']);
  assert.deepEqual(r.order(['tavily', 'brave'], 'lru', (n) => n !== 'tavily'), ['brave', 'tavily']);
  r.clear();
  assert.deepEqual(r.order(['brave', 'tavily'], 'lru', healthy), ['brave', 'tavily'], 'never-used ties keep configured order');
});

// --- TTL cache -------------------------------------------------------------------------------

test('TtlCache: ttl, FIFO cap, single-flight, disabled when ttl or max is 0', async () => {
  const now = makeClock();
  const cache = new TtlCache<number>({ ttlMs: () => 1000, max: () => 2, now });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.equal(cache.get('a'), null, 'oldest evicted');
  assert.equal(cache.get('c'), 3);
  now.advance(1000);
  assert.equal(cache.get('c'), null, 'expired');
  let runs = 0;
  const task = async () => {
    runs += 1;
    await new Promise((r) => setTimeout(r, 5));
    return 7;
  };
  const a = cache.singleFlight('k', task);
  const b = cache.singleFlight('k', task);
  assert.equal(b.joined, true);
  assert.deepEqual(await Promise.all([a.promise, b.promise]), [7, 7]);
  assert.equal(runs, 1);
  const off = new TtlCache<number>({ ttlMs: () => 0, max: () => 10, now });
  off.set('x', 1);
  assert.equal(off.get('x'), null);
});

// --- URLs ------------------------------------------------------------------------------------

test('webUrl: safeHttpUrl, canonical form, host, URLs in text', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('file:///etc/passwd'), null);
  assert.equal(safeHttpUrl('not a url'), null);
  assert.ok(safeHttpUrl('https://example.org/x'));
  assert.equal(
    canonicalizeUrl('https://Example.org:443/p/?utm_source=x&b=2&a=1#frag'),
    'https://example.org/p?a=1&b=2',
  );
  assert.equal(canonicalizeUrl('https://example.org/p?a=1&b=2'), canonicalizeUrl('https://example.org/p/?b=2&a=1&fbclid=z'));
  assert.notEqual(canonicalizeUrl('https://example.org/p?a=1'), canonicalizeUrl('https://example.org/p?a=2'));
  assert.notEqual(canonicalizeUrl('http://example.org/p'), canonicalizeUrl('https://example.org/p'));
  assert.equal(canonicalizeUrl('https://example.org:8443/p'), 'https://example.org:8443/p');
  assert.equal(displayHost('https://www.padel.example.org/x'), 'padel.example.org');
  assert.deepEqual(
    extractUrlsFromText('See https://a.example.org/x, and (https://b.example.org/Padel_(sport)). Also ftp://c.example.org'),
    ['https://a.example.org/x', 'https://b.example.org/Padel_(sport)'],
  );
});

// --- utils + adapters ------------------------------------------------------------------------

test('providerUtils: clamp, trim, normalize (http(s) only, dedupe, caps)', () => {
  assert.equal(clampCount(undefined), 5);
  assert.equal(clampCount(0), 1);
  assert.equal(clampCount(99), 8);
  assert.equal(clampCount(3.7), 3);
  assert.equal(trimSnippet('x'.repeat(500)).length, MAX_SNIPPET_CHARS);
  const results = normalizeResults(
    [
      { title: 'A', url: 'https://a.example.org/1', content: '  many   spaces ' },
      { title: 'dup', url: 'https://a.example.org/1/?utm_source=x' },
      { title: 'bad', url: 'javascript:alert(1)' },
      { title: 'ftp', url: 'ftp://x.example.org' },
      { title: 'T'.repeat(400), link: 'http://b.example.org', description: 'd' },
      null,
    ],
    5,
  );
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], { title: 'A', url: 'https://a.example.org/1', snippet: 'many spaces' });
  assert.equal(results[1].title.length, 160);
  assert.deepEqual(Object.keys(results[1]).sort(), ['snippet', 'title', 'url']);
});

test('tavily: bearer header only, body shape, answer, errors without the key', async () => {
  const env = testEnv();
  const { fetchImpl, calls } = makeRouterFetch({ tavily: [TAVILY_OK, { status: 429, headers: { 'retry-after': '3' } }, { status: 401 }] });
  const ok = await tavilyProvider.search({ query: 'padel rules', count: 3, fetchImpl, env });
  assert.equal(ok.results.length, 1);
  assert.equal(ok.answer, 'Padel is a racket sport.');
  const init = calls.tavily[0].init!;
  assert.equal(init.method, 'POST');
  assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer test-tavily-key');
  const body = JSON.parse(String(init.body));
  assert.deepEqual(body, { query: 'padel rules', max_results: 3, search_depth: 'basic', include_answer: true });
  assert.ok(!String(init.body).includes('test-tavily-key'), 'key never in the body');
  await assert.rejects(
    tavilyProvider.search({ query: 'q', count: 3, fetchImpl, env }),
    (err: WebSearchError) => err.kind === 'rate_limited' && err.retryAfterMs === 3000 && !err.message.includes('test-tavily-key'),
  );
  await assert.rejects(tavilyProvider.search({ query: 'q', count: 3, fetchImpl, env }), (err: WebSearchError) => err.kind === 'auth');
  assert.equal(tavilyProvider.isConfigured(testEnv({ TAVILY_API_KEY: '' })), false);
});

test('brave: GET with token header, only search_result hits, errors', async () => {
  const env = testEnv();
  const { fetchImpl, calls } = makeRouterFetch({
    brave: [
      {
        json: {
          web: {
            results: [
              { title: 'B', url: 'https://brave.example.org/r', description: 'd', type: 'search_result' },
              { title: 'V', url: 'https://video.example.org', type: 'video_result' },
              { title: 'N', url: 'https://notype.example.org', description: 'n' },
            ],
          },
        },
      },
      { status: 503 },
      { text: 'not json' },
    ],
  });
  const ok = await braveProvider.search({ query: 'padel club', count: 4, fetchImpl, env });
  assert.deepEqual(ok.results.map((r) => r.title), ['B', 'N']);
  const url = new URL(calls.brave[0].url);
  assert.equal(url.searchParams.get('q'), 'padel club');
  assert.equal(url.searchParams.get('count'), '4');
  assert.ok(!calls.brave[0].url.includes('test-brave-key'), 'key never in the URL');
  assert.equal((calls.brave[0].init!.headers as Record<string, string>)['X-Subscription-Token'], 'test-brave-key');
  await assert.rejects(braveProvider.search({ query: 'q', count: 4, fetchImpl, env }), (e: WebSearchError) => e.kind === 'server');
  await assert.rejects(braveProvider.search({ query: 'q', count: 4, fetchImpl, env }), (e: WebSearchError) => e.kind === 'unknown');
  void BRAVE_OK;
});

test('network failure → network kind, message without URL', async () => {
  const env = testEnv();
  const throwing = async () => {
    throw Object.assign(new Error('connect ECONNREFUSED https://api.search.brave.com/?token=leak'), { name: 'TypeError' });
  };
  await assert.rejects(
    braveProvider.search({ query: 'q', count: 3, fetchImpl: throwing, env }),
    (e: WebSearchError) => e.kind === 'network' && !e.message.includes('leak') && !e.message.includes('http'),
  );
});

test('duckduckgo: parser, uddg unwrap, 202 is rate_limited, configured only when enabled', async () => {
  const html =
    "<div><a rel='nofollow' class='result__a' href='//duckduckgo.com/l/?uddg=https%3A%2F%2Fpadel.example.org%2Frules&rut=x'>Padel &amp; rules</a>" +
    '<a class="result__snippet" href="#">The <b>rules</b> of padel</a>' +
    '<a href="https://direct.example.org/" class="result__a">Direct</a></div>';
  assert.deepEqual(parseDuckDuckGoHtml(html, 5), [
    { title: 'Padel & rules', url: 'https://padel.example.org/rules', snippet: 'The rules of padel' },
    { title: 'Direct', url: 'https://direct.example.org/', snippet: '' },
  ]);
  assert.deepEqual(parseDuckDuckGoHtml('<html>no results</html>', 5), []);
  assert.equal(duckDuckGoProvider.isConfigured(testEnv()), false);
  const env = testEnv({ AGENT_WEB_SEARCH_DDG_ENABLED: 'true' });
  assert.equal(duckDuckGoProvider.isConfigured(env), true);
  const { fetchImpl } = makeRouterFetch({ duckduckgo: [{ status: 202, text: 'bot' }] });
  await assert.rejects(duckDuckGoProvider.search({ query: 'q', count: 3, fetchImpl, env }), (e: WebSearchError) => e.kind === 'rate_limited');
});

void suite.run();
