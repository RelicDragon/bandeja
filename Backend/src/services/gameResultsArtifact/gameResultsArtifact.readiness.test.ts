import assert from 'node:assert/strict';
import { GameResultsArtifactStepStatus } from '@prisma/client';
import { isResultsArtifactsReady } from './gameResultsArtifact.readiness';

function run() {
  assert.equal(
    isResultsArtifactsReady({ summaryStatus: 'done', photoStatus: 'done' }),
    true
  );
  assert.equal(
    isResultsArtifactsReady({ summaryStatus: 'skipped', photoStatus: 'skipped' }),
    true
  );
  assert.equal(
    isResultsArtifactsReady({ summaryStatus: 'done', photoStatus: 'skipped' }),
    true
  );
  assert.equal(
    isResultsArtifactsReady({ summaryStatus: 'pending', photoStatus: 'done' }),
    false
  );
  assert.equal(
    isResultsArtifactsReady({ summaryStatus: 'done', photoStatus: 'failed' }),
    false
  );
  assert.equal(
    isResultsArtifactsReady({ summaryStatus: 'running', photoStatus: 'skipped' }),
    false
  );

  const statuses: GameResultsArtifactStepStatus[] = [
    'pending',
    'running',
    'done',
    'skipped',
    'failed',
  ];
  for (const summaryStatus of statuses) {
    for (const photoStatus of statuses) {
      const expected =
        (summaryStatus === 'done' || summaryStatus === 'skipped') &&
        (photoStatus === 'done' || photoStatus === 'skipped');
      assert.equal(
        isResultsArtifactsReady({ summaryStatus, photoStatus }),
        expected,
        `${summaryStatus}/${photoStatus}`
      );
    }
  }

  console.log('gameResultsArtifact.readiness.test.ts: ok');
}

run();
