import assert from 'node:assert/strict';
import {
  isBlockedIpAddress,
  ssrfSafeFetchBytes,
  readResponseBodyCapped,
  SsrfFetchError,
  GIPHY_MAX_BYTES,
} from './ssrfSafeFetch';
import { detectImageMagic, validateGiphyImageBuffer, GiphyValidateError } from './giphyValidateImage';

async function run(): Promise<void> {
  assert.equal(isBlockedIpAddress('127.0.0.1'), true);
  assert.equal(isBlockedIpAddress('10.0.0.1'), true);
  assert.equal(isBlockedIpAddress('192.168.1.1'), true);
  assert.equal(isBlockedIpAddress('172.16.5.1'), true);
  assert.equal(isBlockedIpAddress('169.254.1.1'), true);
  assert.equal(isBlockedIpAddress('100.64.0.1'), true);
  assert.equal(isBlockedIpAddress('8.8.8.8'), false);
  assert.equal(isBlockedIpAddress('::1'), true);
  assert.equal(isBlockedIpAddress('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedIpAddress('::ffff:7f00:1'), true); // 127.0.0.1 hex-mapped
  assert.equal(isBlockedIpAddress('::ffff:a00:1'), true); // 10.0.0.1 hex-mapped
  assert.equal(isBlockedIpAddress('::ffff:808:808'), false); // 8.8.8.8 hex-mapped

  assert.equal(detectImageMagic(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00')), 'gif');
  assert.equal(detectImageMagic(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(detectImageMagic(Buffer.from('not-an-image')), null);

  await assert.rejects(
    () => validateGiphyImageBuffer(Buffer.from('not-an-image')),
    (err: unknown) => err instanceof GiphyValidateError
  );

  await assert.rejects(
    () => validateGiphyImageBuffer(Buffer.alloc(GIPHY_MAX_BYTES + 1, 0x47)),
    (err: unknown) => err instanceof GiphyValidateError && /too large/i.test(err.message)
  );

  {
    let calls = 0;
    const fetchFn: typeof fetch = async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://evil.example.com/steal' },
      });
    };
    await assert.rejects(
      () =>
        ssrfSafeFetchBytes('https://media.giphy.com/media/abc/giphy.gif', {
          fetchFn,
          lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
        }),
      (err: unknown) => err instanceof SsrfFetchError && /allowlist/i.test(err.message)
    );
    assert.equal(calls, 1);
  }

  {
    await assert.rejects(
      () =>
        ssrfSafeFetchBytes('https://media.giphy.com/media/abc/giphy.gif', {
          fetchFn: async () => new Response(Buffer.from('GIF89a')),
          lookupFn: async () => [
            { address: '8.8.8.8', family: 4 },
            { address: '10.0.0.1', family: 4 },
          ],
        }),
      (err: unknown) => err instanceof SsrfFetchError && /IP/i.test(err.message)
    );
  }

  {
    await assert.rejects(
      () =>
        ssrfSafeFetchBytes('https://media.giphy.com/media/abc/giphy.gif', {
          fetchFn: async () => new Response(Buffer.from('GIF89a')),
          lookupFn: async () => [{ address: '127.0.0.1', family: 4 }],
        }),
      (err: unknown) => err instanceof SsrfFetchError && /IP/i.test(err.message)
    );
  }

  {
    let n = 0;
    const fetchFn: typeof fetch = async () => {
      n += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: `https://media.giphy.com/media/hop${n}/giphy.gif` },
      });
    };
    await assert.rejects(
      () =>
        ssrfSafeFetchBytes('https://media.giphy.com/media/start/giphy.gif', {
          fetchFn,
          lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
          maxRedirects: 3,
        }),
      (err: unknown) => err instanceof SsrfFetchError && /redirect/i.test(err.message)
    );
    assert.ok(n >= 4);
  }

  {
    await assert.rejects(
      () =>
        ssrfSafeFetchBytes('https://media.giphy.com/media/abc/giphy.gif', {
          fetchFn: async () =>
            new Response(Buffer.alloc(10), {
              status: 200,
              headers: { 'content-length': String(GIPHY_MAX_BYTES + 1) },
            }),
          lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
        }),
      (err: unknown) => err instanceof SsrfFetchError && /large/i.test(err.message)
    );
  }

  // Streaming body oversize without Content-Length
  {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const chunk = new Uint8Array(1024);
        for (let i = 0; i < 12; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const res = new Response(stream, { status: 200 });
    await assert.rejects(
      () => readResponseBodyCapped(res, 8 * 1024),
      (err: unknown) => err instanceof SsrfFetchError && /large/i.test(err.message)
    );
  }

  {
    const body = Buffer.from('GIF89a....fake');
    const { buffer, finalUrl } = await ssrfSafeFetchBytes(
      'https://media.giphy.com/media/abc/giphy.gif',
      {
        fetchFn: async () =>
          new Response(body, { status: 200, headers: { 'content-type': 'image/gif' } }),
        lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
      }
    );
    assert.equal(buffer.equals(body), true);
    assert.equal(finalUrl, 'https://media.giphy.com/media/abc/giphy.gif');
  }

  console.log('ssrfSafeFetch.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
