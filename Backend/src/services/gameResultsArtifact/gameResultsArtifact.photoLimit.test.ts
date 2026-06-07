import assert from 'node:assert/strict';
import {
  assertPhotoGenerationsAvailable,
  ARTIFACT_PHOTO_GENERATIONS_MAX_DEFAULT,
  ARTIFACT_PHOTO_GENERATIONS_MAX_PREMIUM,
  getMaxArtifactPhotoGenerations,
  photoGenerationsRemaining,
} from './gameResultsArtifact.photoLimit';
import { buildResultsArtifactsDto } from './gameResultsArtifact.dto';

assert.equal(ARTIFACT_PHOTO_GENERATIONS_MAX_DEFAULT, 2);
assert.equal(ARTIFACT_PHOTO_GENERATIONS_MAX_PREMIUM, 5);
assert.equal(getMaxArtifactPhotoGenerations(false), 2);
assert.equal(getMaxArtifactPhotoGenerations(true), 5);
assert.equal(photoGenerationsRemaining(0, 2), 2);
assert.equal(photoGenerationsRemaining(1, 2), 1);
assert.equal(photoGenerationsRemaining(2, 2), 0);
assert.equal(photoGenerationsRemaining(0, 5), 5);
assert.equal(photoGenerationsRemaining(5, 5), 0);

assert.throws(() => assertPhotoGenerationsAvailable(2, 2), /limit reached/i);

const dto = buildResultsArtifactsDto(
  {
    resultsArtifactsVersion: 1,
    resultsArtifactsReadyAt: null,
    resultsArtifactJob: {
      status: 'pending',
      summaryStatus: 'done',
      photoStatus: 'skipped',
      photoGenerationsUsed: 1,
    },
  },
  2
);
assert.equal(dto.photoGenerationsUsed, 1);
assert.equal(dto.photoGenerationsRemaining, 1);
assert.equal(dto.photoGenerationsMax, 2);
assert.equal(dto.photoInFlight, false);

console.log('gameResultsArtifact.photoLimit.test.ts: ok');
