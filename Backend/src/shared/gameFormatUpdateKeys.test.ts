import assert from 'node:assert/strict';
import { GAME_FORMAT_UPDATE_KEYS as pkgKeys } from '@bandeja/shared/gameFormatUpdateKeys';
import { GAME_FORMAT_UPDATE_KEYS, isGameFormatOnlyUpdate } from './gameFormatUpdateKeys';

function testFormatOnlyWithAffectsRating(): void {
  assert.equal(
    isGameFormatOnlyUpdate({ scoringPreset: 'POINTS_16', affectsRating: false }),
    true,
  );
  assert.equal(isGameFormatOnlyUpdate({ name: 'x', affectsRating: false }), false);
}

function testKeysParityWithSharedPackage(): void {
  const feKeys = [...pkgKeys].sort();
  const beKeys = [...GAME_FORMAT_UPDATE_KEYS].sort();
  assert.deepEqual(beKeys, feKeys, 'GAME_FORMAT_UPDATE_KEYS must match @bandeja/shared');
}

function run(): void {
  testFormatOnlyWithAffectsRating();
  testKeysParityWithSharedPackage();
  assert(GAME_FORMAT_UPDATE_KEYS.has('affectsRating'));
  console.log('gameFormatUpdateKeys.test.ts: all passed');
}

run();
