import assert from 'node:assert/strict';
import { GAME_FORMAT_UPDATE_KEYS, isGameFormatOnlyUpdate } from './gameFormatUpdateKeys';

function testFormatOnlyWithAffectsRating(): void {
  assert.equal(
    isGameFormatOnlyUpdate({ scoringPreset: 'POINTS_16', affectsRating: false }),
    true,
  );
  assert.equal(isGameFormatOnlyUpdate({ name: 'x', affectsRating: false }), false);
}

function run(): void {
  testFormatOnlyWithAffectsRating();
  assert(GAME_FORMAT_UPDATE_KEYS.has('affectsRating'));
  console.log('gameFormatUpdateKeys.test.ts: all passed');
}

run();
