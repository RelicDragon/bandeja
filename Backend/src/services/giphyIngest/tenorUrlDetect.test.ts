import assert from 'node:assert/strict';
import { isDirectTenorMediaUrl } from './giphyHosts';
import {
  extractTenorMediaUrlFromHtml,
  resolveTenorMediaDownloadUrl,
} from './tenorUrlDetect';

async function run(): Promise<void> {
  assert.equal(
    isDirectTenorMediaUrl('https://media.tenor.com/rYCdWzuqXIIAAAAM/petty-parker-smoke.gif'),
    true
  );
  assert.equal(
    isDirectTenorMediaUrl('https://media1.tenor.com/m/rYCdWzuqXIIAAAAC/petty-parker-smoke.gif'),
    true
  );
  assert.equal(
    isDirectTenorMediaUrl('https://media.tenor.com/rYCdWzuqXIIAAAPo/petty-parker-smoke.mp4'),
    false
  );
  assert.equal(isDirectTenorMediaUrl('https://tenor.com/view/x-gif-1'), false);

  assert.equal(
    extractTenorMediaUrlFromHtml(
      '<html><meta property="og:image" content="https://media1.tenor.com/m/rYCdWzuqXIIAAAAC/petty-parker-smoke.gif"></html>'
    ),
    'https://media1.tenor.com/m/rYCdWzuqXIIAAAAC/petty-parker-smoke.gif'
  );
  assert.equal(
    extractTenorMediaUrlFromHtml('<meta content="https://evil.com/x.gif" property="og:image">'),
    null
  );

  {
    const page =
      'https://tenor.com/view/petty-parker-smoke-snoop-dogg-homer-simpson-disappear-gif-17093677';
    const media = 'https://media1.tenor.com/m/rYCdWzuqXIIAAAAC/petty-parker-smoke.gif';
    const result = await resolveTenorMediaDownloadUrl(page, {
      fetchFn: async () =>
        new Response(`<meta property="og:image" content="${media}">`, { status: 200 }),
      lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
    });
    assert.equal(result, media);
  }

  {
    const media = 'https://media.tenor.com/rYCdWzuqXIIAAAAM/petty-parker-smoke.gif';
    const result = await resolveTenorMediaDownloadUrl(media);
    assert.equal(result, media);
  }

  console.log('tenorUrlDetect.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
