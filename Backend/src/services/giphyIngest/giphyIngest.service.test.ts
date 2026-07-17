import assert from 'node:assert/strict';
import {
  tryConsumeGiphyIngestRateLimit,
  resetGiphyIngestRateLimitForTests,
  GIPHY_INGEST_MAX_PER_WINDOW,
} from './giphyIngest.rateLimit';
import { resolveGiphyMediaDownloadUrl, tryConvertGiphyPasteToImage } from './giphyIngest.service';
import { detectGiphyUrlOnly } from './giphyUrlDetect';
import { resolveGiphyImageDimensions } from './giphyValidateImage';

async function run(): Promise<void> {
  assert.deepEqual(
    resolveGiphyImageDimensions({
      width: 270,
      height: 35_040,
      pageHeight: 480,
    }),
    { width: 270, height: 480 }
  );

  resetGiphyIngestRateLimitForTests();
  for (let i = 0; i < GIPHY_INGEST_MAX_PER_WINDOW; i++) {
    assert.equal(tryConsumeGiphyIngestRateLimit('user-rate'), true);
  }
  assert.equal(tryConsumeGiphyIngestRateLimit('user-rate'), false);
  assert.equal(tryConsumeGiphyIngestRateLimit('other-user'), true);

  {
    const url = 'https://media.giphy.com/media/FiGiRei2ICzzG/giphy.gif';
    const resolved = await resolveGiphyMediaDownloadUrl(url, { apiKey: null });
    assert.equal(resolved, url);
  }

  {
    const resolved = await resolveGiphyMediaDownloadUrl(
      'https://giphy.com/gifs/funny-cat-FiGiRei2ICzzG',
      { apiKey: 'should-not-be-called-on-resolve' }
    );
    assert.equal(resolved, 'https://media.giphy.com/media/FiGiRei2ICzzG/giphy.gif');
  }

  {
    const pasted = detectGiphyUrlOnly('https://media.giphy.com/media/FiGiRei2ICzzG/giphy.gif');
    assert.ok(pasted);
    const result = await tryConvertGiphyPasteToImage(pasted!, {
      apiKey: null,
      fetchFn: async () => new Response(Buffer.from('not-image'), { status: 200 }),
      lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
      processChatImage: async () => {
        throw new Error('should not process');
      },
    });
    assert.equal(result, null);
  }

  {
    const result = await tryConvertGiphyPasteToImage(
      'https://media.giphy.com/media/FiGiRei2ICzzG/giphy.gif',
      {
        apiKey: null,
        fetchFn: async () =>
          new Response(null, {
            status: 302,
            headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
          }),
        lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
      }
    );
    assert.equal(result, null);
  }

  {
    const tinyGif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    const result = await tryConvertGiphyPasteToImage(
      'https://media.giphy.com/media/FiGiRei2ICzzG/giphy.gif',
      {
        apiKey: null,
        fetchFn: async () =>
          new Response(tinyGif, { status: 200, headers: { 'content-type': 'image/gif' } }),
        lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
        processChatImage: async (buf, name) => {
          assert.ok(buf.length > 0);
          assert.ok(name.endsWith('.gif'));
          return {
            originalPath: 'https://cdn.example.com/uploads/chat/originals/abc.gif',
            thumbnailPath: 'https://cdn.example.com/uploads/chat/thumbnails/abc_thumb.jpg',
            originalSize: { width: 1, height: 1 },
            thumbnailSize: { width: 1, height: 1 },
          };
        },
      }
    );
    assert.ok(result);
    assert.equal(result!.mediaUrl.includes('uploads/chat/originals/'), true);
    assert.equal(/giphy\.com/i.test(result!.mediaUrl), false);
  }

  {
    const tinyGif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    const result = await tryConvertGiphyPasteToImage(
      'https://static1.klipy.com/party.gif',
      {
        apiKey: null,
        fetchFn: async () =>
          new Response(tinyGif, { status: 200, headers: { 'content-type': 'image/gif' } }),
        lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
        processChatImage: async () => ({
          originalPath: 'https://cdn.example.com/uploads/chat/originals/klipy.gif',
          thumbnailPath: 'https://cdn.example.com/uploads/chat/thumbnails/klipy_thumb.jpg',
          originalSize: { width: 1, height: 1 },
          thumbnailSize: { width: 1, height: 1 },
        }),
      }
    );
    assert.ok(result);
    assert.equal(/klipy\.com/i.test(result!.mediaUrl), false);
  }

  {
    const tinyGif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    const result = await tryConvertGiphyPasteToImage('https://klipy.com/gifs/hello-hi-662', {
      apiKey: null,
      klipyApiKey: 'klipy-key',
      fetchFn: async (input) => {
        const url = String(input);
        if (url.includes('/gifs/items')) {
          return new Response(
            JSON.stringify({
              result: true,
              data: {
                data: [
                  {
                    slug: 'hello-hi-662',
                    file: {
                      md: {
                        gif: { url: 'https://static1.klipy.com/ii/abc/hello.gif' },
                      },
                    },
                  },
                ],
              },
            }),
            { status: 200 }
          );
        }
        return new Response(tinyGif, { status: 200, headers: { 'content-type': 'image/gif' } });
      },
      lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
      processChatImage: async () => ({
        originalPath: 'https://cdn.example.com/uploads/chat/originals/klipy-page.gif',
        thumbnailPath: 'https://cdn.example.com/uploads/chat/thumbnails/klipy-page_thumb.jpg',
        originalSize: { width: 1, height: 1 },
        thumbnailSize: { width: 1, height: 1 },
      }),
    });
    assert.ok(result);
    assert.equal(/klipy\.com/i.test(result!.mediaUrl), false);
  }

  {
    const tinyGif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    const brokenOg = 'https://media1.tenor.com/m/rYCdWzuqXIIAAAAC/petty-parker-smoke.gif';
    const fetched: string[] = [];
    const result = await tryConvertGiphyPasteToImage(
      'https://tenor.com/view/petty-parker-smoke-gif-17093677',
      {
        apiKey: null,
        fetchFn: async (input) => {
          const url = String(input);
          fetched.push(url);
          if (url.includes('tenor.com/view/')) {
            return new Response(`<meta property="og:image" content="${brokenOg}">`, {
              status: 200,
            });
          }
          if (url.includes('media1.tenor.com/m/')) {
            return new Response('missing', { status: 404 });
          }
          return new Response(tinyGif, { status: 200, headers: { 'content-type': 'image/gif' } });
        },
        lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
        processChatImage: async () => ({
          originalPath: 'https://cdn.example.com/uploads/chat/originals/tenor.gif',
          thumbnailPath: 'https://cdn.example.com/uploads/chat/thumbnails/tenor_thumb.jpg',
          originalSize: { width: 1, height: 1 },
          thumbnailSize: { width: 1, height: 1 },
        }),
      }
    );
    assert.ok(result);
    assert.equal(/tenor\.(com|co)/i.test(result!.mediaUrl), false);
    assert.ok(fetched.some((u) => u.includes('media.tenor.com/rYCdWzuqXIIAAAAM/')));
  }

  // API fallback only after primary rehost fails
  {
    let fetchCalls = 0;
    const tinyGif = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    const result = await tryConvertGiphyPasteToImage(
      'https://giphy.com/gifs/funny-cat-FiGiRei2ICzzG',
      {
        apiKey: 'test-key',
        fetchFn: async (input) => {
          fetchCalls += 1;
          const url = String(input);
          if (url.includes('api.giphy.com')) {
            return new Response(
              JSON.stringify({
                data: {
                  images: {
                    original: {
                      url: 'https://media2.giphy.com/media/FiGiRei2ICzzG/giphy.gif',
                    },
                  },
                },
              }),
              { status: 200 }
            );
          }
          if (fetchCalls === 1) {
            return new Response(Buffer.from('not-image'), { status: 200 });
          }
          return new Response(tinyGif, { status: 200, headers: { 'content-type': 'image/gif' } });
        },
        lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
        processChatImage: async () => ({
          originalPath: 'https://cdn.example.com/uploads/chat/originals/from-api.gif',
          thumbnailPath: 'https://cdn.example.com/uploads/chat/thumbnails/from-api_thumb.jpg',
          originalSize: { width: 1, height: 1 },
          thumbnailSize: { width: 1, height: 1 },
        }),
      }
    );
    assert.ok(result);
    assert.ok(fetchCalls >= 2);
    assert.equal(result!.mediaUrl.includes('from-api.gif'), true);
  }

  console.log('giphyIngest.service.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
