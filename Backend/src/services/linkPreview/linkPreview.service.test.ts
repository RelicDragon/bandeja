import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  issueLinkPreviewSnapshotToken,
  verifyLinkPreviewSnapshotToken,
} from './linkPreviewSnapshotToken';
import { parseOgMeta } from './parseOgMeta';
import { isSkippedLinkPreviewHost } from './linkPreviewHosts';
import {
  fetchLinkPreview,
  presentLinkPreviewForClient,
  resetLinkPreviewCacheForTests,
} from './linkPreview.service';
import {
  assertPublicHttpsUrl,
  ssrfSafePublicFetchBytes,
  SsrfFetchError,
} from './ssrfSafePublicFetch';
import { parseBandejaLink, appLinkCopyKey } from './parseBandejaLink';
import { parseYoutubeVideoId } from './youtubeLinkPreview';
import {
  extractFirstEligiblePreviewUrl,
  normalizeEligiblePreviewSelection,
} from './extractEligiblePreviewUrl';
import {
  detectLinkPreviewProvider,
  fetchProviderLinkPreview,
} from './providerLinkPreview';
import {
  buildProxiedImagePath,
  fetchProxiedImageBytes,
  resetLinkPreviewImageCacheForTests,
  verifyProxiedImageParams,
} from './linkPreviewImageProxy';

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
    const png = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 30, g: 120, b: 220, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    let calls = 0;
    const transformed = await fetchProxiedImageBytes('https://example.com/pixel.png', {
      fetchFn: async () => {
        calls += 1;
        return new Response(Uint8Array.from(png), {
          headers: { 'content-type': 'image/png' },
        });
      },
      width: 64,
      height: 64,
      accept: 'image/webp',
    });
    const cached = await fetchProxiedImageBytes('https://example.com/pixel.png', {
      fetchFn: async () => {
        calls += 1;
        return new Response(Uint8Array.from(png), {
          headers: { 'content-type': 'image/png' },
        });
      },
      width: 64,
      height: 64,
      accept: 'image/webp',
    });
    assert.equal(transformed.contentType, 'image/webp');
    assert.equal(cached.etag, transformed.etag);
    assert.equal(calls, 1);
    resetLinkPreviewImageCacheForTests();
    const changedPng = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 220, g: 40, b: 40, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const changed = await fetchProxiedImageBytes('https://example.com/pixel.png', {
      fetchFn: async () =>
        new Response(Uint8Array.from(changedPng), {
          headers: { 'content-type': 'image/png' },
        }),
      width: 64,
      height: 64,
      accept: 'image/webp',
    });
    assert.notEqual(changed.etag, transformed.etag);
    const snapshot = {
      url: 'https://example.com/',
      finalUrl: 'https://example.com/',
      source: 'external' as const,
      entityType: 'external' as const,
      title: 'Example',
      titleKey: null,
      description: null,
      descriptionKey: null,
      imageUrl: null,
      siteName: 'Example',
      hostname: 'example.com',
      badgeKey: null,
      avatarUrl: null,
      sport: null,
      levelLabel: null,
      playerAvatars: [],
      provider: null,
      status: null,
      participantCount: null,
      participantCapacity: null,
      mutable: false,
      refreshedAt: null,
    };
    const token = issueLinkPreviewSnapshotToken(snapshot);
    assert.equal(verifyLinkPreviewSnapshotToken(token)?.title, 'Example');
    assert.equal(verifyLinkPreviewSnapshotToken(`${token}x`), null);
  }

  {
    const jsonFetch =
      (body: Record<string, unknown>): typeof fetch =>
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
    const spotify = await fetchProviderLinkPreview(
      new URL('https://open.spotify.com/track/abc'),
      { fetchFn: jsonFetch({ title: 'Track', author_name: 'Artist', thumbnail_url: 'https://i.scdn.co/x.jpg' }) }
    );
    assert.equal(spotify?.provider, 'spotify');
    assert.equal(spotify?.title, 'Track');

    const tiktok = await fetchProviderLinkPreview(
      new URL('https://www.tiktok.com/@creator/video/123'),
      { fetchFn: jsonFetch({ title: 'Clip', author_name: 'Creator' }) }
    );
    assert.equal(tiktok?.provider, 'tiktok');

    const x = await fetchProviderLinkPreview(new URL('https://x.com/user/status/123'), {
      fetchFn: jsonFetch({ author_name: 'Author' }),
    });
    assert.equal(x?.provider, 'x');

    const github = await fetchProviderLinkPreview(
      new URL('https://github.com/RelicDragon/bandeja'),
      {
        fetchFn: jsonFetch({
          full_name: 'RelicDragon/bandeja',
          description: 'Repository',
          owner: { avatar_url: 'https://avatars.githubusercontent.com/u/1' },
        }),
      }
    );
    assert.equal(github?.provider, 'github');

    const instagram = await fetchProviderLinkPreview(
      new URL('https://www.instagram.com/reel/abc/'),
      {
        fetchFn: async (input) => {
          const url = String(input);
          if (url.includes('/instagram_oembed')) {
            assert.equal(url.includes('access_token='), false);
            return new Response(
              JSON.stringify({
                provider_name: 'Instagram',
                type: 'rich',
                html: '<blockquote class="instagram-media"></blockquote>',
              }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            );
          }
          return new Response(
            '<html><head><meta property="og:title" content="@creator on Instagram: &quot;A very long reel caption that should not fill the preview card&quot;"><meta property="og:description" content="22 likes, 0 comments - creator: &quot;A very long reel caption that should not fill the preview card&quot;"><meta property="og:image" content="https://cdninstagram.com/reel.jpg"></head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          );
        },
      }
    );
    assert.equal(instagram?.provider, 'instagram');
    assert.equal(instagram?.title, '@creator on Instagram');
    assert.equal(instagram?.description, null);
    assert.equal(instagram?.imageUrl, 'https://cdninstagram.com/reel.jpg');

    const playtomic = await fetchProviderLinkPreview(
      new URL('https://playtomic.io/tenant/example'),
      {
        fetchFn: async () =>
          new Response(
            '<html><head><meta property="og:title" content="Playtomic Club"><meta property="og:description" content="Book a court"></head></html>',
            { status: 200, headers: { 'content-type': 'text/html' } }
          ),
      }
    );
    assert.equal(playtomic?.provider, 'playtomic');
  }

  {
    const source = 'https://images.example.com/large.jpg';
    const pathA = buildProxiedImagePath(source, { width: 320, height: 180 });
    const pathB = buildProxiedImagePath(source, { width: 320, height: 180 });
    assert.equal(pathA, pathB);
    const params = new URL(pathA!, 'https://bandeja.me').searchParams;
    assert.deepEqual(
      verifyProxiedImageParams({
        url: params.get('url') ?? undefined,
        w: params.get('w') ?? undefined,
        h: params.get('h') ?? undefined,
        sig: params.get('sig') ?? undefined,
      }),
      { url: source, width: 320, height: 180 }
    );
  }

  {
    const fixtures: Array<[string, string]> = [
      ['https://open.spotify.com/track/abc', 'spotify'],
      ['https://www.instagram.com/reel/abc/', 'instagram'],
      ['https://www.tiktok.com/@creator/video/123', 'tiktok'],
      ['https://x.com/bandeja/status/123', 'x'],
      ['https://github.com/RelicDragon/bandeja', 'github'],
      ['https://playtomic.io/tenant/example', 'playtomic'],
    ];
    for (const [url, provider] of fixtures) {
      assert.equal(detectLinkPreviewProvider(new URL(url)), provider);
    }
  }

  {
    assert.equal(isSkippedLinkPreviewHost('giphy.com'), true);
    assert.equal(isSkippedLinkPreviewHost('klipy.com'), true);
    assert.equal(isSkippedLinkPreviewHost('tenor.com'), true);
    assert.equal(isSkippedLinkPreviewHost('media.tenor.com'), true);
    assert.equal(isSkippedLinkPreviewHost('bandeja.me'), true);
    assert.equal(isSkippedLinkPreviewHost('example.com'), false);
  }

  {
    assert.throws(() => assertPublicHttpsUrl('http://example.com'), SsrfFetchError);
    assert.ok(assertPublicHttpsUrl('https://example.com/a'));
    await assert.rejects(
      ssrfSafePublicFetchBytes('https://example.com/a', {
        lookupFn: async () => [
          { address: '93.184.216.34', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ],
        fetchFn: async () => {
          throw new Error('must not fetch mixed public/private DNS');
        },
      }),
      SsrfFetchError
    );
    const publicPage = await ssrfSafePublicFetchBytes('https://example.com', {
      maxBytes: 64 * 1024,
    });
    assert.match(publicPage.buffer.toString('utf8'), /Example Domain/i);
  }

  {
    const game = parseBandejaLink('https://bandeja.me/games/abc123/chat');
    assert.equal(game?.kind, 'gameChat');
    assert.equal(game?.id, 'abc123');
    assert.equal(appLinkCopyKey('/find', '?view=calendar&dayOffset=0'), 'app.findToday');
    assert.equal(appLinkCopyKey('/create-game', ''), 'app.createGame');
  }

  {
    resetLinkPreviewCacheForTests();
    const app = await fetchLinkPreview('https://bandeja.me/create-game', {
      viewerUserId: 'user-1',
    });
    assert.equal(app?.source, 'bandeja');
    assert.equal(app?.entityType, 'app');
    assert.equal(app?.titleKey, 'app.createGame');
    assert.equal(app?.title, null);
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
    assert.equal(a?.source, 'external');
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

  {
    assert.equal(parseYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(
      parseYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      'dQw4w9WgXcQ'
    );
    assert.equal(parseYoutubeVideoId('https://www.youtube.com/shorts/abc123XYZ'), 'abc123XYZ');
  }

  {
    resetLinkPreviewCacheForTests();
    const yt = await fetchLinkPreview('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      fetchFn: async (input) => {
        const u = String(input);
        if (u.includes('oembed')) {
          return new Response(
            JSON.stringify({ title: 'Test Video', author_name: 'Uploader' }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        throw new Error(`unexpected fetch ${u}`);
      },
    });
    assert.equal(yt?.provider, 'youtube');
    assert.equal(yt?.title, 'Test Video');
    assert.ok(yt?.imageUrl?.includes('i.ytimg.com'));
    const presented = presentLinkPreviewForClient(yt);
    assert.ok(presented?.imageUrl?.includes('/link-preview/image?'));
  }

  {
    assert.equal(extractFirstEligiblePreviewUrl('see https://bandeja.me/find now'), 'https://bandeja.me/find');
    assert.equal(extractFirstEligiblePreviewUrl('https://giphy.com/x only'), null);
    assert.equal(extractFirstEligiblePreviewUrl('https://klipy.com/gifs/hello-hi-662'), null);
    assert.equal(extractFirstEligiblePreviewUrl('https://tenor.com/view/x-gif-1'), null);
    assert.equal(
      normalizeEligiblePreviewSelection('https://example.org', [
        'https://example.com/',
        'https://example.org/',
      ]),
      'https://example.org/'
    );
  }

  console.log('linkPreview.service.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
