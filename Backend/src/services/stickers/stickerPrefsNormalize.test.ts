import assert from 'assert';
import { MAX_STICKER_FAVORITES, MAX_STICKER_RECENT } from './stickerConstants';
import {
  bumpRecentIdList,
  normalizeFavoritesInput,
  normalizeRecentInput,
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
  const recent = Array.from({ length: MAX_STICKER_RECENT + 10 }, (_, i) => `r${i}`);
  const nFav = normalizeFavoritesInput(favs)!;
  const nRec = normalizeRecentInput(recent)!;
  assert.equal(nFav.length, MAX_STICKER_FAVORITES);
  assert.equal(nFav[0], 'f0');
  assert.equal(nFav[nFav.length - 1], `f${MAX_STICKER_FAVORITES - 1}`);
  assert.equal(nRec.length, MAX_STICKER_RECENT);
  assert.equal(nRec[0], 'r0');
  console.log('ok favorites/recent caps');
}

function testBumpRecent() {
  assert.deepEqual(bumpRecentIdList(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
  assert.deepEqual(bumpRecentIdList([], 'z'), ['z']);
  assert.deepEqual(bumpRecentIdList(null, 'z'), ['z']);
  const many = Array.from({ length: MAX_STICKER_RECENT }, (_, i) => `r${i}`);
  const bumped = bumpRecentIdList(many, 'new');
  assert.equal(bumped.length, MAX_STICKER_RECENT);
  assert.equal(bumped[0], 'new');
  assert.equal(bumped[1], 'r0');
  assert.ok(!bumped.includes(`r${MAX_STICKER_RECENT - 1}`));
  console.log('ok bumpRecentIdList MRU + cap');
}

testNormalizePreservesMruOrderAndDedupes();
testCaps();
testBumpRecent();
