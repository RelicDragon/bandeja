import assert from 'node:assert/strict';
import { parseOgMeta } from './parseOgMeta';
import { isSkippedLinkPreviewHost } from './linkPreviewHosts';
import {
  fetchLinkPreview,
  resetLinkPreviewCacheForTests,
} from './linkPreview.service';
import { assertPublicHttpsUrl, SsrfFetchError } from './ssrfSafePublicFetch';

async function run(): Promise<void> {
  resetLinkPreviewCacheForTests();

  {
    const meta = parseOgMeta(
      `<!doctype html><html><head>
      <meta property="og:title" content="Hello &amp; World" />
      <meta property="og:description" content="Desc" />
      <meta property="og:image" content="/img.png" />
      <meta property="og:site_name" content="Example" />
      <title>Fallback</title>
    </head><body></body></html>`,
      'https://example.com/page'
    );
    assert.equal(meta.title, 'Hello & World');
    assert.equal(meta.description, 'Desc');
    assert.equal(meta.imageUrl, 'https://example.com/img.png');
    assert.equal(meta.siteName, 'Example');
  }

  {
    assert.equal(isSkippedLinkPreviewHost('giphy.com'), true);
    assert.equal(isSkippedLinkPreviewHost('media2.giphy.com'), true);
    assert.equal(isSkippedLinkPreviewHost('bandeja.me'), true);
    assert.equal(isSkippedLinkPreviewHost('www.bandeja.me'), true);
    assert.equal(isSkippedLinkPreviewHost('example.com'), false);
  }

  {
    assert.throws(() => assertPublicHttpsUrl('http://example.com'), SsrfFetchError);
    assert.throws(() => assertPublicHttpsUrl('https://127.0.0.1/'), SsrfFetchError);
    assert.ok(assertPublicHttpsUrl('https://example.com/a'));
  }

  {
    resetLinkPreviewCacheForTests();
    const html = `<html><head>
    <meta property="og:title" content="Cached Title" />
    <meta property="og:description" content="Hi" />
  </head></html>`;
    let calls = 0;
    const fetchFn: typeof fetch = async () => {
      calls += 1;
      return new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    };
    const a = await fetchLinkPreview('https://example.com/article', { fetchFn });
    const b = await fetchLinkPreview('https://example.com/article', { fetchFn });
    assert.equal(a?.title, 'Cached Title');
    assert.equal(b?.title, 'Cached Title');
    assert.equal(calls, 1);
  }

  {
    resetLinkPreviewCacheForTests();
    const preview = await fetchLinkPreview('https://giphy.com/gifs/x', {
      fetchFn: async () => {
        throw new Error('should not fetch');
      },
    });
    assert.equal(preview, null);
  }

  console.log('linkPreview.service.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
