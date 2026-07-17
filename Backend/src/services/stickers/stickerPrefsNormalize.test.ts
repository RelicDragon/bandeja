import assert from 'assert';
import { MAX_STICKER_FAVORITES, MAX_STICKER_RECENT } from './stickerConstants';
import {
  bumpRecentMedia,
  normalizeFavoritesInput,
  normalizeRecentMediaInput,
  normalizeStickerIdList,
} from './stickerPrefsNormalize';

function testNormalizePreservesMruOrderAndDedupes() {
  assert.deepEqual(normalizeStickerIdList(['a', 'b', 'a', 'c'], 10), ['a', 'b', 'c']);
  assert.deepEqual(normalizeStickerIdList(['  x  ', '', 'y', null, 1, 'x'], 10), ['x', 'y']);
  assert.equal(normalizeStickerIdList('nope', 10), undefined);
  assert.deepEqual(normalizeStickerIdList([], 10), []);
  console.log('ok normalizeStickerIdList order/dedupe');
}

function testCaps() {
  const favs = Array.from({ length: MAX_STICKER_FAVORITES + 25 }, (_, i) => `f${i}`);
  const recent = Array.from({ length: MAX_STICKER_RECENT + 10 }, (_, i) => ({
    kind: 'STICKER',
    stickerId: `r${i}`,
  }));
  const nFav = normalizeFavoritesInput(favs)!;
  const nRec = normalizeRecentMediaInput(recent)!;
  assert.equal(nFav.length, MAX_STICKER_FAVORITES);
  assert.equal(nFav[0], 'f0');
  assert.equal(nFav[nFav.length - 1], `f${MAX_STICKER_FAVORITES - 1}`);
  assert.equal(nRec.length, MAX_STICKER_RECENT);
  assert.deepEqual(nRec[0], { kind: 'STICKER', stickerId: 'r0' });
  console.log('ok favorites/recent caps');
}

function testBumpRecent() {
  const sticker = (stickerId: string) => ({ kind: 'STICKER' as const, stickerId });
  assert.deepEqual(
    bumpRecentMedia([sticker('a'), sticker('b'), sticker('c')], sticker('b')),
    [sticker('b'), sticker('a'), sticker('c')]
  );
  assert.deepEqual(bumpRecentMedia([], sticker('z')), [sticker('z')]);
  assert.deepEqual(bumpRecentMedia(null, sticker('z')), [sticker('z')]);
  const many = Array.from({ length: MAX_STICKER_RECENT }, (_, i) => sticker(`r${i}`));
  const bumped = bumpRecentMedia(many, sticker('new'));
  assert.equal(bumped.length, MAX_STICKER_RECENT);
  assert.deepEqual(bumped[0], sticker('new'));
  assert.deepEqual(bumped[1], sticker('r0'));
  assert.ok(!bumped.some((item) => item.kind === 'STICKER' && item.stickerId === `r${MAX_STICKER_RECENT - 1}`));
  const gif = {
    kind: 'GIF' as const,
    provider: 'GIPHY' as const,
    id: 'party',
    title: 'Party',
    previewUrl: 'https://media.giphy.com/party-preview.gif',
    downloadUrl: 'https://media.giphy.com/party.gif',
    width: 200,
    height: 200,
  };
  assert.deepEqual(bumpRecentMedia([sticker('a'), gif], gif), [gif, sticker('a')]);
  console.log('ok bumpRecentMedia MRU + cap');
}

function testRejectsUntrustedGifUrls() {
  assert.deepEqual(
    normalizeRecentMediaInput([
      {
        kind: 'GIF',
        provider: 'GIPHY',
        id: 'track',
        title: 'Tracking pixel',
        previewUrl: 'https://example.com/track.gif',
        downloadUrl: 'https://media.giphy.com/valid.gif',
        width: 1,
        height: 1,
      },
    ]),
    []
  );
  console.log('ok rejects untrusted GIF URLs');
}

testNormalizePreservesMruOrderAndDedupes();
testCaps();
testBumpRecent();
testRejectsUntrustedGifUrls();
