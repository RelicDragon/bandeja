import assert from 'node:assert/strict';
import {
  isGiphySearchConfigured,
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

async function main() {
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
    assert.deepEqual(await readGiphySearchCache(searchIdentity, cache), page);
    assert.equal(
      giphySearchCacheKey(searchIdentity),
      giphySearchCacheKey({ query: 'padel', offset: 0, limit: 24 })
    );

    const fetchFn = async (): Promise<Response> => {
      throw new Error('provider should not be called on cache hit');
    };
    assert.deepEqual(
      await searchGiphyGifs('padel', {}, { apiKey: '', cache, fetchFn }),
      page
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
    assert.equal(page.items[0]?.id, 'abc123XYZ0');
    assert.equal(page.items[0]?.title, 'Funny cat');
    assert.match(page.items[0]?.previewUrl ?? '', /media\.giphy\.com/);
    assert.match(page.items[0]?.downloadUrl ?? '', /media\.giphy\.com/);
    assert.equal(page.hasMore, true);
    assert.equal(page.totalCount, 40);
    assert.equal(page.nextOffset, 2);
    assert.equal(page.offset, 0);
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
    () => searchGiphyGifs('x', {}, { apiKey: '' }),
    (err: unknown) => err instanceof Error && err.message === 'GIPHY_API_KEY_MISSING'
  );

  console.log('giphySearch.service.test.ts: ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
