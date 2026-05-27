import assert from 'node:assert/strict';
import {
  pickResultsPhotoStyle,
  RESULTS_PHOTO_STYLES,
} from './gameResultsArtifact.photoStyles';

const ids = RESULTS_PHOTO_STYLES.map((s) => s.id);
assert.equal(new Set(ids).size, 20, 'expected 20 unique style ids');

const a = pickResultsPhotoStyle('game-1:3');
const b = pickResultsPhotoStyle('game-1:3');
assert.deepEqual(a, b, 'picker must be deterministic for fixed seed');

const c = pickResultsPhotoStyle('game-1:4');
assert.notDeepEqual(a, c, 'generationVersion bump should change style');

console.log('gameResultsArtifact.photoStyles.test.ts: ok');
