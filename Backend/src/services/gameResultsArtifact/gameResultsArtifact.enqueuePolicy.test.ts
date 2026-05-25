import assert from 'node:assert/strict';
import {
  buildArtifactJobResetSteps,
  nextArtifactGenerationVersion,
  shouldEnqueueArtifactsOnRecalculate,
  shouldSkipArtifactReenqueue,
} from './gameResultsArtifact.enqueuePolicy';

function run() {
  assert.equal(
    shouldSkipArtifactReenqueue({ resultsSentToTelegram: true }),
    true
  );
  assert.equal(
    shouldSkipArtifactReenqueue({ resultsSentToTelegram: false }),
    false
  );
  assert.equal(
    shouldSkipArtifactReenqueue({
      resultsSentToTelegram: true,
      forceRegenerate: true,
    }),
    false
  );

  const reset = buildArtifactJobResetSteps();
  assert.equal(reset.summaryStatus, 'pending');
  assert.equal(reset.photoStatus, 'pending');
  assert.equal(reset.replicatePredictionId, null);

  assert.equal(nextArtifactGenerationVersion(0), 1);
  assert.equal(nextArtifactGenerationVersion(3), 4);

  assert.equal(
    shouldEnqueueArtifactsOnRecalculate({
      resultsStatus: 'FINAL',
      wasEdited: true,
      isFirstFinalize: false,
    }),
    true
  );
  assert.equal(
    shouldEnqueueArtifactsOnRecalculate({
      resultsStatus: 'FINAL',
      wasEdited: false,
      isFirstFinalize: true,
    }),
    true
  );
  assert.equal(
    shouldEnqueueArtifactsOnRecalculate({
      resultsStatus: 'FINAL',
      wasEdited: false,
      isFirstFinalize: false,
    }),
    false
  );
  assert.equal(
    shouldEnqueueArtifactsOnRecalculate({
      resultsStatus: 'IN_PROGRESS',
      wasEdited: true,
      isFirstFinalize: false,
    }),
    false
  );

  console.log('gameResultsArtifact.enqueuePolicy.test.ts: ok');
}

run();
