/**
 * `web_images` search + UI entries (no network): provider parsing, https-only, failover,
 * cache, and the signed proxy paths the app loads instead of third-party URLs.
 */
import assert from 'node:assert/strict';
import type { AgentWebEnvConfig } from '../../../../config/agentWebEnv';
import { verifyProxiedImageParams } from '../../../linkPreview/linkPreviewImageProxy';
import { createWebImageSearch } from '../search/webImageSearch';
import { toWebImage, webImageId } from '../../tools/web.tools';
import { RATE_LIMITED, createSuite, makeClock, makeRouterFetch, testEnv } from './webTestUtils';

const suite = createSuite('webImageSearch.test.ts');
const { test } = suite;

const TAVILY_IMAGES = {
  json: {
    results: [],
    images: [
      { url: 'https://img.example.org/diamond.jpg', description: 'Diamond-shaped padel racket' },
      'https://img.example.org/round.png',
      { url: 'http://img.example.org/insecure.jpg', description: 'dropped: not https' },
      { url: 'https://img.example.org/diamond.jpg', description: 'duplicate' },
      { url: 'javascript:alert(1)' },
    ],
  },
};

const BRAVE_IMAGES = {
  json: {
    results: [
      {
        title: 'Teardrop racket',
        url: 'https://shop.example.com/teardrop',
        properties: { url: 'https://cdn.example.com/teardrop.webp', width: 800, height: 600 },
      },
      { title: 'no image', url: 'https://shop.example.com/x', properties: {} },
    ],
  },
};

function searchWith(routes: Parameters<typeof makeRouterFetch>[0], overrides: Record<string, string | undefined> = {}) {
  const router = makeRouterFetch(routes);
  const env: AgentWebEnvConfig = testEnv(overrides);
  const search = createWebImageSearch({ env: () => env, fetchImpl: router.fetchImpl, now: makeClock(), log: () => undefined });
  return { search, calls: router.calls };
}

test('Tavily: https only, de-duplicated, strings and objects', async () => {
  const { search, calls } = searchWith({ tavily: [TAVILY_IMAGES] }, { AGENT_WEB_SEARCH_PROVIDER_ORDER: 'tavily,brave' });
  const outcome = await search.search('padel racket shapes', { count: 6 });
  assert.equal(outcome.provider, 'tavily');
  assert.deepEqual(
    outcome.images.map((i) => [i.url, i.alt]),
    [
      ['https://img.example.org/diamond.jpg', 'Diamond-shaped padel racket'],
      ['https://img.example.org/round.png', ''],
    ],
  );
  const body = JSON.parse(String(calls.tavily[0].init?.body));
  assert.equal(body.include_images, true);
  assert.ok(!String(calls.tavily[0].init?.body).includes('test-tavily-key'), 'key only in the header');
});

test('fails over to Brave Images; keeps page URL and size', async () => {
  const { search, calls } = searchWith({ tavily: [RATE_LIMITED()], brave: [BRAVE_IMAGES] }, { AGENT_WEB_SEARCH_PROVIDER_ORDER: 'tavily,brave' });
  const outcome = await search.search('teardrop racket');
  assert.equal(outcome.provider, 'brave');
  assert.deepEqual(outcome.images, [
    { url: 'https://cdn.example.com/teardrop.webp', pageUrl: 'https://shop.example.com/teardrop', alt: 'Teardrop racket', width: 800, height: 600 },
  ]);
  assert.ok(calls.brave[0].url.includes('/images/search'));
  assert.ok(calls.brave[0].url.includes('safesearch=strict'));
  assert.deepEqual(outcome.tried, [{ provider: 'tavily', error: 'rate_limited' }]);
});

test('every provider failing = exhausted; cache answers a repeat', async () => {
  const failing = searchWith({ tavily: [RATE_LIMITED()], brave: [RATE_LIMITED()] });
  assert.equal((await failing.search.search('x racket')).exhausted, true);

  const { search, calls } = searchWith({ tavily: [TAVILY_IMAGES] }, { AGENT_WEB_SEARCH_PROVIDER_ORDER: 'tavily' });
  await search.search('racket');
  const again = await search.search('RACKET');
  assert.equal(again.cached, true);
  assert.equal(calls.tavily.length, 1);
});

test('kill switch and empty query never call a provider', async () => {
  const { search, calls } = searchWith({}, { AGENT_WEB_SEARCH_ENABLED: 'false' });
  assert.equal((await search.search('racket')).disabled, true);
  assert.equal((await search.search('  ')).error, 'empty_query');
  assert.equal(calls.tavily.length + calls.brave.length, 0);
});

test('UI entry: stable id, signed proxy paths only, host from the page', () => {
  const image = toWebImage({
    url: 'https://cdn.example.com/teardrop.webp',
    pageUrl: 'https://www.shop.example.com/teardrop',
    alt: 'Teardrop racket',
    width: 800,
    height: 600,
  });
  assert.ok(image);
  assert.equal(image.id, webImageId('https://cdn.example.com/teardrop.webp'));
  assert.match(image.id, /^[0-9a-f]{10}$/);
  assert.equal(image.host, 'shop.example.com');
  assert.ok(image.src.startsWith('/link-preview/image?'));
  assert.ok(image.thumb.startsWith('/link-preview/image?'));

  const params = Object.fromEntries(new URLSearchParams(image.src.split('?')[1]));
  assert.equal(params.fit, 'inside');
  const verified = verifyProxiedImageParams(params);
  assert.deepEqual([verified.width, verified.height, verified.fit], [640, 640, 'inside']);
  assert.throws(() => verifyProxiedImageParams({ ...params, fit: undefined }), /signature/, 'fit is signed');

  const full = verifyProxiedImageParams(Object.fromEntries(new URLSearchParams(image.full.split('?')[1])));
  assert.deepEqual([full.width, full.height, full.fit], [1600, 1600, 'inside'], 'fullscreen size');
  const thumb = verifyProxiedImageParams(Object.fromEntries(new URLSearchParams(image.thumb.split('?')[1])));
  assert.equal(thumb.fit, 'cover');

  assert.equal(toWebImage({ url: 'https://127.0.0.1/x.png', pageUrl: null, alt: '', width: null, height: null }), null, 'private host refused');
});

void suite.run();
