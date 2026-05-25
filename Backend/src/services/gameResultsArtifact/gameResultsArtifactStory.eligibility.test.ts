import assert from 'node:assert/strict';
import { isGameResultStoryEligible } from './gameResultsArtifactStory.eligibility';

function run() {
  assert.equal(
    isGameResultStoryEligible({
      resultsStatus: 'FINAL',
      resultsArtifactsReadyAt: new Date(),
    }),
    true
  );
  assert.equal(
    isGameResultStoryEligible({
      resultsStatus: 'FINAL',
      resultsArtifactsReadyAt: null,
    }),
    false
  );
  assert.equal(
    isGameResultStoryEligible({
      resultsStatus: 'IN_PROGRESS',
      resultsArtifactsReadyAt: new Date(),
    }),
    false
  );

  console.log('gameResultsArtifactStory.eligibility.test.ts: ok');
}

run();
