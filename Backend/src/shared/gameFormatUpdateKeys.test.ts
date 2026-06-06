import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_FORMAT_UPDATE_KEYS, isGameFormatOnlyUpdate } from './gameFormatUpdateKeys';

const feKeysPath = join(__dirname, '../../../Frontend/shared/gameFormatUpdateKeys.ts');

function testFormatOnlyWithAffectsRating(): void {
  assert.equal(
    isGameFormatOnlyUpdate({ scoringPreset: 'POINTS_16', affectsRating: false }),
    true,
  );
  assert.equal(isGameFormatOnlyUpdate({ name: 'x', affectsRating: false }), false);
}

function testKeysParityWithFrontend(): void {
  const src = readFileSync(feKeysPath, 'utf8');
  const match = src.match(/GAME_FORMAT_UPDATE_KEYS = new Set\(\[([\s\S]*?)\]\)/);
  assert(match, 'Could not parse Frontend GAME_FORMAT_UPDATE_KEYS');
  const feKeys = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  const beKeys = [...GAME_FORMAT_UPDATE_KEYS].sort();
  assert.deepEqual(beKeys, feKeys, 'GAME_FORMAT_UPDATE_KEYS must match Frontend/shared');
}

function run(): void {
  testFormatOnlyWithAffectsRating();
  testKeysParityWithFrontend();
  assert(GAME_FORMAT_UPDATE_KEYS.has('affectsRating'));
  console.log('gameFormatUpdateKeys.test.ts: all passed');
}

run();
