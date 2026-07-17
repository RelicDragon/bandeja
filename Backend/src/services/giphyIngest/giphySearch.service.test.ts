import assert from 'node:assert/strict';
import {
  isGiphySearchConfigured,
  GIF_SEARCH_PROVIDER_TIMEOUT_MS,
  searchGiphyGifs,
  trendingGiphyGifs,
  type GiphySearchDeps,
} from './giphySearch.service';
import {
  tryConsumeGiphySearchRateLimit,
  resetGiphySearchRateLimitForTests,
  GIPHY_SEARCH_MAX_PER_WINDOW,
} from './giphySearch.rateLimit';
import {
  GIPHY_SEARCH_CACHE_TTL_SECONDS,
  GIPHY_TRENDING_CACHE_TTL_SECONDS,
  giphySearchCacheKey,
  readGiphySearchCache,
  writeGiphySearchCache,
  type GiphySearchCacheStore,
} from './giphySearch.cache';
import { resetGifProviderHealthForTests } from './gifProviderHealth';

async function main() {
  resetGifProviderHealthForTests();
  assert.ok(GIF_SEARCH_PROVIDER_TIMEOUT_MS * 2 < 15_000);
  resetGiphySearchRateLimitForTests();
  for (let i = 0; i < GIPHY_SEARCH_MAX_PER_WINDOW; i++) {
    assert.equal(tryConsumeGiphySearchRateLimit('user-search'), true);
  }
  assert.equal(tryConsumeGiphySearchRateLimit('user-search'), false);
  assert.equal(tryConsumeGiphySearchRateLimit('other-user'), true);

  assert.equal(isGiphySearchConfigured(''), false);
  assert.equal(isGiphySearchConfigured('   '), false);
  assert.equal(isGiphySearchConfigured('abc123'), true);

  {
    const values = new Map<string, { response: unknown; expiresAt: Date }>();
    const cache: GiphySearchCacheStore = {
      findUnique: async ({ where }) => values.get(where.key) ?? null,
      upsert: async ({ where, create, update }) => {
        const current = values.get(where.key);
        values.set(
          where.key,
          current
            ? { response: update.response, expiresAt: update.expiresAt }
            : { response: create.response, expiresAt: create.expiresAt }
        );
      },
    };
    const page = {
      provider: 'GIPHY' as const,
      items: [],
      offset: 0,
      nextOffset: 0,
      limit: 24,
      totalCount: 0,
      hasMore: false,
    };
    const trendingIdentity = { query: '', offset: 0, limit: 24 };
    const searchIdentity = { query: '  Padel  ', offset: 0, limit: 24 };

    await writeGiphySearchCache(trendingIdentity, page, cache);
    await writeGiphySearchCache(searchIdentity, page, cache);

    const now = Date.now();
    const trendingTtl = Math.round(
      (values.get(giphySearchCacheKey(trendingIdentity))!.expiresAt.getTime() - now) / 1_000
    );
    const searchTtl = Math.round(
      (values.get(giphySearchCacheKey(searchIdentity))!.expiresAt.getTime() - now) / 1_000
    );
    assert.equal(trendingTtl, GIPHY_TRENDING_CACHE_TTL_SECONDS);
    assert.equal(searchTtl, GIPHY_SEARCH_CACHE_TTL_SECONDS);
    const klipyIdentity = {
      query: 'fallback',
      offset: 0,
      limit: 24,
      provider: 'KLIPY' as const,
    };
    await writeGiphySearchCache(
      klipyIdentity,
      { ...page, provider: 'KLIPY', items: [] },
      cache
    );
    const klipyTtl = Math.round(
      (values.get(giphySearchCacheKey(klipyIdentity))!.expiresAt.getTime() - now) / 1_000
    );
    assert.equal(klipyTtl, GIPHY_SEARCH_CACHE_TTL_SECONDS);
    const klipyTrendingIdentity = {
      query: '',
      offset: 0,
      limit: 12,
      provider: 'KLIPY' as const,
    };
    await writeGiphySearchCache(
      klipyTrendingIdentity,
      { ...page, provider: 'KLIPY', limit: 12 },
      cache
    );
    const klipyTrendingTtl = Math.round(
      (values.get(giphySearchCacheKey(klipyTrendingIdentity))!.expiresAt.getTime() - now) /
        1_000
    );
    assert.equal(klipyTrendingTtl, GIPHY_TRENDING_CACHE_TTL_SECONDS);
    assert.equal(
      giphySearchCacheKey(searchIdentity),
      giphySearchCacheKey({ ...searchIdentity, provider: 'GIPHY' })
    );
    assert.notEqual(
      giphySearchCacheKey(searchIdentity),
      giphySearchCacheKey({ ...searchIdentity, provider: 'KLIPY' })
    );
    assert.deepEqual(await readGiphySearchCache(searchIdentity, cache), page);
    assert.equal(
      giphySearchCacheKey(searchIdentity),
      giphySearchCacheKey({ query: 'padel', offset: 0, limit: 24 })
    );
    const invalidIdentity = { query: 'invalid', offset: 0, limit: 24 };
    values.set(giphySearchCacheKey(invalidIdentity), {
      response: { ...page, items: [{ id: 123 }] },
      expiresAt: new Date(Date.now() + 60_000),
    });
    assert.equal(await readGiphySearchCache(invalidIdentity, cache), null);
    const expiredIdentity = { query: 'expired', offset: 0, limit: 24 };
    values.set(giphySearchCacheKey(expiredIdentity), {
      response: page,
      expiresAt: new Date(Date.now() - 1),
    });
    assert.equal(await readGiphySearchCache(expiredIdentity, cache), null);

    const fetchFn = async (): Promise<Response> => {
      throw new Error('provider should not be called on cache hit');
    };
    assert.deepEqual(
      await searchGiphyGifs('padel', {}, {
        apiKey: '',
        klipyApiKey: '',
        cache,
        fetchFn,
        authorizeCacheMiss: async () => {
          throw new Error('cache hit must not consume rate limit');
        },
      }),
      page
    );

    let providerCalls = 0;
    let cacheMissAuthorizations = 0;
    const missDeps: GiphySearchDeps = {
      apiKey: 'test-key',
      cache,
      lookupFn: async () => [{ address: '151.101.2.49', family: 4 }],
      fetchFn: async () => {
        providerCalls += 1;
        return new Response(
          JSON.stringify({
            data: [],
            pagination: { total_count: 0, count: 0, offset: 0 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
      authorizeCacheMiss: async () => {
        cacheMissAuthorizations += 1;
        return true;
      },
    };
    const missPage = { ...page, limit: 0 };
    const [firstMiss, coalescedMiss] = await Promise.all([
      searchGiphyGifs('tennis', {}, missDeps),
      searchGiphyGifs('TENNIS', {}, missDeps),
    ]);
    assert.deepEqual(firstMiss, missPage);
    assert.deepEqual(coalescedMiss, missPage);
    assert.equal(providerCalls, 1);
    assert.equal(cacheMissAuthorizations, 1);
    await assert.rejects(
      searchGiphyGifs('blocked-query', {}, {
        ...missDeps,
        authorizeCacheMiss: async () => false,
      }),
      /GIF_SEARCH_RATE_LIMITED/
    );
    assert.deepEqual(
      await searchGiphyGifs(' tennis ', {}, {
        apiKey: '',
        klipyApiKey: '',
        cache,
        fetchFn,
      }),
      missPage
    );
  }

  {
    let calledUrl = '';
    const deps: GiphySearchDeps = {
      apiKey: 'test-key',
      fetchFn: async (input) => {
        calledUrl = String(input);
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'abc123XYZ0',
                title: 'Funny cat',
                images: {
                  fixed_width_downsampled: {
                    url: 'https://media.giphy.com/media/abc123XYZ0/200w_d.gif',
                    width: '200',
                    height: '150',
                  },
                  fixed_width_still: {
                    url: 'https://media.giphy.com/media/abc123XYZ0/200_s.gif',
                    width: '200',
                    height: '150',
                  },
                  downsized: {
                    url: 'https://media.giphy.com/media/abc123XYZ0/giphy-downsized.gif',
                    width: '400',
                    height: '300',
                  },
                  original: {
                    url: 'https://media.giphy.com/media/abc123XYZ0/giphy.gif',
                    width: '480',
                    height: '360',
                  },
                },
              },
              {
                id: 'bad',
                title: 'Missing urls',
                images: {},
              },
            ],
            pagination: { total_count: 40, count: 2, offset: 0 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
      lookupFn: async () => [{ address: '151.101.2.49', family: 4 }],
    };

    const page = await searchGiphyGifs('cats', { offset: 0, limit: 24 }, deps);
    assert.match(calledUrl, /api\.giphy\.com\/v1\/gifs\/search/);
    assert.match(calledUrl, /api_key=test-key/);
    assert.match(calledUrl, /q=cats/);
    assert.equal(page.items.length, 1);
    assert.equal(page.provider, 'GIPHY');
    assert.equal(page.items[0]?.provider, 'GIPHY');
    assert.equal(page.items[0]?.id, 'abc123XYZ0');
    assert.equal(page.items[0]?.title, 'Funny cat');
    assert.match(page.items[0]?.previewUrl ?? '', /media\.giphy\.com/);
    assert.match(page.items[0]?.staticUrl ?? '', /200_s\.gif/);
    assert.match(page.items[0]?.downloadUrl ?? '', /media\.giphy\.com/);
    assert.equal(page.hasMore, true);
    assert.equal(page.totalCount, 40);
    assert.equal(page.nextOffset, 24);
    assert.equal(page.offset, 0);
  }

  {
    resetGifProviderHealthForTests();
    const calls: string[] = [];
    const deps: GiphySearchDeps = {
      apiKey: 'giphy-key',
      klipyApiKey: 'klipy-key',
      fetchFn: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.includes('api.giphy.com')) {
          return new Response('provider down', { status: 503 });
        }
        const requestedPage = Number(new URL(url).searchParams.get('page') ?? '1');
        return new Response(
          JSON.stringify({
            result: true,
            data: {
              data: [
                {
                  id: 42,
                  slug: 'klipy-party',
                  title: 'Klipy party',
                  type: 'gif',
                  file: {
                    sm: {
                      gif: {
                        url: 'https://static1.klipy.com/small.gif',
                        width: 220,
                        height: 180,
                      },
                    },
                    md: {
                      gif: {
                        url: 'https://static.klipy.com/medium.gif',
                        width: 300,
                        height: 245,
                      },
                    },
                  },
                },
              ],
              current_page: requestedPage,
              per_page: 24,
              has_next: true,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
      lookupFn: async () => [{ address: '151.101.2.49', family: 4 }],
      cache: null,
    };
    const page = await searchGiphyGifs(
      'party',
      { offset: 24, limit: 24, provider: 'GIPHY' },
      deps
    );
    assert.equal(calls.length, 2);
    assert.match(calls[0] ?? '', /api\.giphy\.com/);
    assert.match(calls[1] ?? '', /api\.klipy\.com\/api\/v1\/klipy-key\/gifs\/search/);
    assert.match(calls[1] ?? '', /page=2/);
    assert.equal(page.provider, 'KLIPY');
    assert.equal(page.items[0]?.provider, 'KLIPY');
    assert.equal(page.items[0]?.id, 'klipy-party');
    assert.equal(page.items[0]?.previewUrl, 'https://static1.klipy.com/small.gif');
    assert.equal(page.items[0]?.downloadUrl, 'https://static.klipy.com/medium.gif');
    assert.equal(page.hasMore, true);
    assert.equal(page.offset, 24);
    assert.equal(page.nextOffset, 48);

    await searchGiphyGifs('second', { limit: 24 }, deps);
    assert.equal(calls.length, 3);
    assert.match(calls[2] ?? '', /api\.klipy\.com/);

    // Fallback must not poison preferred-provider cache: after cooldown, Giphy is tried again.
    const values = new Map<string, { response: unknown; expiresAt: Date }>();
    const poisonCache: GiphySearchCacheStore = {
      findUnique: async ({ where }) => values.get(where.key) ?? null,
      upsert: async ({ where, create, update }) => {
        const current = values.get(where.key);
        values.set(
          where.key,
          current
            ? { response: update.response, expiresAt: update.expiresAt }
            : { response: create.response, expiresAt: create.expiresAt }
        );
      },
    };
    resetGifProviderHealthForTests();
    const poisonDeps: GiphySearchDeps = {
      ...deps,
      cache: poisonCache,
      nowFn: () => 0,
    };
    const fallbackPage = await searchGiphyGifs(
      'poison',
      { limit: 24, provider: 'GIPHY' },
      poisonDeps
    );
    assert.equal(fallbackPage.provider, 'KLIPY');
    assert.equal(
      values.has(giphySearchCacheKey({ query: 'poison', offset: 0, limit: 24, provider: 'GIPHY' })),
      false
    );
    assert.equal(
      values.has(giphySearchCacheKey({ query: 'poison', offset: 0, limit: 24, provider: 'KLIPY' })),
      true
    );
    resetGifProviderHealthForTests();
    let giphyRetried = false;
    const recovered = await searchGiphyGifs(
      'poison',
      { limit: 24, provider: 'GIPHY' },
      {
        ...poisonDeps,
        nowFn: () => 120_000,
        fetchFn: async (input) => {
          const url = String(input);
          if (url.includes('api.giphy.com')) {
            giphyRetried = true;
            return new Response(
              JSON.stringify({
                data: [
                  {
                    id: 'recoveredGif1',
                    title: 'Back',
                    images: {
                      fixed_width_downsampled: {
                        url: 'https://media.giphy.com/media/recoveredGif1/200w_d.gif',
                        width: '200',
                        height: '150',
                      },
                      downsized: {
                        url: 'https://media.giphy.com/media/recoveredGif1/giphy-downsized.gif',
                        width: '400',
                        height: '300',
                      },
                    },
                  },
                ],
                pagination: { total_count: 1, count: 1, offset: 0 },
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            );
          }
          throw new Error('klipy should not be needed');
        },
      }
    );
    assert.equal(giphyRetried, true);
    assert.equal(recovered.provider, 'GIPHY');
    resetGifProviderHealthForTests();
  }

  {
    resetGifProviderHealthForTests();
    const deps: GiphySearchDeps = {
      apiKey: 'giphy-key',
      klipyApiKey: 'klipy-key',
      cache: null,
      nowFn: () => 0,
      fetchFn: async () => new Response('down', { status: 503 }),
      lookupFn: async () => [{ address: '151.101.2.49', family: 4 }],
    };
    await assert.rejects(
      () => searchGiphyGifs('both-down', { limit: 12 }, deps),
      /GIPHY_SEARCH_FAILED/
    );
    await assert.rejects(
      () => searchGiphyGifs('cooling', { limit: 12 }, deps),
      (err: unknown) =>
        err instanceof Error && err.message === 'GIF_SEARCH_PROVIDERS_COOLING_DOWN'
    );
    resetGifProviderHealthForTests();
  }

  {
    const calls: string[] = [];
    const deps: GiphySearchDeps = {
      apiKey: '',
      klipyApiKey: 'klipy-key',
      cache: null,
      lookupFn: async () => [{ address: '151.101.2.49', family: 4 }],
      fetchFn: async (input) => {
        const url = String(input);
        calls.push(url);
        const page = Number(new URL(url).searchParams.get('page') ?? '1');
        return new Response(
          JSON.stringify({
            result: true,
            data: {
              data: Array.from({ length: 10 }, (_, index) => ({
                id: `${page}-${index}`,
                title: `GIF ${page}-${index}`,
                type: 'gif',
                file: {
                  sm: {
                    gif: {
                      url: `https://static.klipy.com/${page}-${index}.gif`,
                      width: 200,
                      height: 200,
                    },
                  },
                },
              })),
              current_page: page,
              per_page: 24,
              has_next: page === 1,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
    };
    const first = await searchGiphyGifs('short-page', { limit: 24 }, deps);
    assert.equal(first.items.length, 10);
    assert.equal(first.nextOffset, 24);
    const second = await searchGiphyGifs(
      'short-page',
      { offset: first.nextOffset, limit: 24, provider: 'KLIPY' },
      deps
    );
    assert.equal(second.items[0]?.id, '2-0');
    assert.match(calls[1] ?? '', /page=2/);
  }

  {
    const deps: GiphySearchDeps = {
      apiKey: 'test-key',
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'httpGif1',
                title: 'http upgrade',
                images: {
                  fixed_width_downsampled: {
                    url: 'http://media.giphy.com/media/httpGif1/200w_d.gif',
                    width: '200',
                    height: '150',
                  },
                  downsized: {
                    url: 'http://media.giphy.com/media/httpGif1/giphy-downsized.gif',
                    width: '400',
                    height: '300',
                  },
                },
              },
            ],
            pagination: { total_count: 1, count: 1, offset: 0 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        ),
      lookupFn: async () => [{ address: '151.101.2.49', family: 4 }],
    };
    const page = await searchGiphyGifs('x', {}, deps);
    assert.equal(page.items.length, 1);
    assert.match(page.items[0]?.previewUrl ?? '', /^https:\/\//);
    assert.match(page.items[0]?.downloadUrl ?? '', /^https:\/\//);
  }

  {
    let calledUrl = '';
    const deps: GiphySearchDeps = {
      apiKey: 'test-key',
      fetchFn: async (input) => {
        calledUrl = String(input);
        return new Response(
          JSON.stringify({
            data: [],
            pagination: { total_count: 0, count: 0, offset: 0 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      },
      lookupFn: async () => [{ address: '151.101.2.49', family: 4 }],
    };

    const page = await trendingGiphyGifs({ limit: 12 }, deps);
    assert.match(calledUrl, /\/v1\/gifs\/trending/);
    assert.equal(page.items.length, 0);
    assert.equal(page.hasMore, false);
  }

  await assert.rejects(
    () => searchGiphyGifs('x', {}, { apiKey: '', klipyApiKey: '' }),
    (err: unknown) => err instanceof Error && err.message === 'GIF_SEARCH_NOT_CONFIGURED'
  );

  console.log('giphySearch.service.test.ts: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
