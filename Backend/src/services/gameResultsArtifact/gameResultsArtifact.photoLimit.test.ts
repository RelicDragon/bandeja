import assert from 'node:assert/strict';
import {
  assertPhotoGenerationsAvailable,
  MAX_ARTIFACT_PHOTO_GENERATIONS,
  photoGenerationsRemaining,
} from './gameResultsArtifact.photoLimit';
import { buildResultsArtifactsDto } from './gameResultsArtifact.dto';

assert.equal(MAX_ARTIFACT_PHOTO_GENERATIONS, 3);
assert.equal(photoGenerationsRemaining(0), 3);
assert.equal(photoGenerationsRemaining(2), 1);
assert.equal(photoGenerationsRemaining(3), 0);
assert.equal(photoGenerationsRemaining(5), 0);

assert.throws(() => assertPhotoGenerationsAvailable(3), /limit reached/i);

const dto = buildResultsArtifactsDto({
  resultsArtifactsVersion: 1,
  resultsArtifactsReadyAt: null,
  resultsArtifactJob: {
    status: 'pending',
    summaryStatus: 'done',
    photoStatus: 'skipped',
    photoGenerationsUsed: 2,
  },
});
assert.equal(dto.photoGenerationsUsed, 2);
assert.equal(dto.photoGenerationsRemaining, 1);
assert.equal(dto.photoInFlight, false);

console.log('gameResultsArtifact.photoLimit.test.ts: ok');
