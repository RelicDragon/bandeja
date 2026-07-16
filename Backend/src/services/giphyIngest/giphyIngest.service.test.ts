import assert from 'node:assert/strict';
import {
  tryConsumeGiphyIngestRateLimit,
  resetGiphyIngestRateLimitForTests,
  GIPHY_INGEST_MAX_PER_WINDOW,
} from './giphyIngest.rateLimit';
import { resolveGiphyMediaDownloadUrl, tryConvertGiphyPasteToImage } from './giphyIngest.service';
import { detectGiphyUrlOnly } from './giphyUrlDetect';

async function run(): Promise<void> {
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
