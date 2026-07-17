import assert from 'node:assert/strict';
import { isDirectTenorMediaUrl } from './giphyHosts';
import {
  expandTenorMediaUrlCandidates,
  extractTenorMediaUrlFromHtml,
  resolveTenorMediaDownloadUrl,
  resolveTenorMediaDownloadUrls,
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

  {
    const candidates = expandTenorMediaUrlCandidates(
      'https://media1.tenor.com/m/rYCdWzuqXIIAAAAC/petty-parker-smoke.gif'
    );
    assert.equal(candidates[0], 'https://media.tenor.com/rYCdWzuqXIIAAAAM/petty-parker-smoke.gif');
    assert.ok(candidates.includes('https://media.tenor.com/rYCdWzuqXIIAAAAC/petty-parker-smoke.gif'));
    assert.ok(candidates.includes('https://c.tenor.com/rYCdWzuqXIIAAAAC/petty-parker-smoke.gif'));
  }

  assert.equal(
    extractTenorMediaUrlFromHtml(
      '<html><meta property="og:image" content="https://media1.tenor.com/m/rYCdWzuqXIIAAAAC/petty-parker-smoke.gif"></html>'
    ),
    'https://media.tenor.com/rYCdWzuqXIIAAAAM/petty-parker-smoke.gif'
  );
  assert.equal(
    extractTenorMediaUrlFromHtml(
      '<meta content="https://evil.com/x.gif" property="og:image">'
    ),
    null
  );
  assert.equal(
    extractTenorMediaUrlFromHtml(
      '<meta property="og:image" content="https://media1.tenor.com/m/rYCdWzuqXIIAAAAC/petty-parker-smoke.gif&amp;utm=1">'
    ),
    'https://media.tenor.com/rYCdWzuqXIIAAAAM/petty-parker-smoke.gif'
  );

  {
    const page =
      'https://tenor.com/view/petty-parker-smoke-snoop-dogg-homer-simpson-disappear-gif-17093677';
    const og = 'https://media1.tenor.com/m/rYCdWzuqXIIAAAAC/petty-parker-smoke.gif';
    const unrelated = 'https://media.tenor.com/HnFEsjHgi10AAAAM/peni-parker-peni.gif';
    const urls = await resolveTenorMediaDownloadUrls(page, {
      fetchFn: async () =>
        new Response(
          `<meta property="og:image" content="${og}"><img src="${unrelated}">`,
          { status: 200 }
        ),
      lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
    });
    assert.equal(urls[0], 'https://media.tenor.com/rYCdWzuqXIIAAAAM/petty-parker-smoke.gif');
    assert.equal(
      urls.some((u) => u.includes('HnFEsjHgi10')),
      false,
      'must not pick related GIFs from page body'
    );
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
