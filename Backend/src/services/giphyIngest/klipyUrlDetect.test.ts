import assert from 'node:assert/strict';
import { extractKlipySlugFromUrl, resolveKlipyPageMediaUrl } from './klipyUrlDetect';

async function run(): Promise<void> {
  assert.equal(extractKlipySlugFromUrl('https://klipy.com/gifs/hello-hi-662'), 'hello-hi-662');
  assert.equal(
    extractKlipySlugFromUrl('https://www.klipy.com/stickers/wave-emoji-1'),
    'wave-emoji-1'
  );
  assert.equal(extractKlipySlugFromUrl('https://static1.klipy.com/party.gif'), null);
  assert.equal(extractKlipySlugFromUrl('https://klipy.com/gifs/'), null);
  assert.equal(extractKlipySlugFromUrl('https://evil.com/gifs/hello-hi-662'), null);

  {
    const result = await resolveKlipyPageMediaUrl('https://klipy.com/gifs/hello-hi-662', {
      apiKey: 'test-key',
      fetchFn: async (input) => {
        assert.match(String(input), /\/gifs\/items\?slugs=hello-hi-662/);
        return new Response(
          JSON.stringify({
            result: true,
            data: {
              data: [
                {
                  slug: 'hello-hi-662',
                  file: {
                    md: {
                      gif: {
                        url: 'https://static1.klipy.com/ii/abc/hello.gif',
                        width: 200,
                        height: 200,
                      },
                    },
                  },
                },
              ],
            },
          }),
          { status: 200 }
        );
      },
      lookupFn: async () => [{ address: '8.8.8.8', family: 4 }],
    });
    assert.equal(result, 'https://static1.klipy.com/ii/abc/hello.gif');
  }

  {
    const result = await resolveKlipyPageMediaUrl('https://klipy.com/gifs/hello-hi-662', {
      apiKey: null,
    });
    assert.equal(result, null);
  }

  console.log('klipyUrlDetect.test.ts: ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
