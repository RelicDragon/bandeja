import assert from 'node:assert/strict';
import { buildResultsArtifactsDto } from './gameResultsArtifact.dto';

function run() {
  const readyAt = new Date('2026-05-25T12:00:00.000Z');

  assert.deepEqual(
    buildResultsArtifactsDto({
      resultsArtifactsVersion: 2,
      resultsArtifactsReadyAt: readyAt,
      resultsArtifactJob: {
        status: 'running',
        summaryStatus: 'done',
        photoStatus: 'pending',
      },
    }),
    {
      status: 'done',
      version: 2,
      summaryReady: true,
      photoReady: false,
      readyAt: readyAt.toISOString(),
    }
  );

  assert.deepEqual(
    buildResultsArtifactsDto({
      resultsArtifactsVersion: 0,
      resultsArtifactsReadyAt: null,
      resultsArtifactJob: null,
    }),
    {
      status: 'none',
      version: 0,
      summaryReady: false,
      photoReady: false,
      readyAt: null,
    }
  );

  assert.equal(
    buildResultsArtifactsDto({
      resultsArtifactsVersion: 1,
      resultsArtifactsReadyAt: null,
      resultsArtifactJob: {
        status: 'pending',
        summaryStatus: 'pending',
        photoStatus: 'skipped',
      },
    }).status,
    'pending'
  );

  assert.equal(
    buildResultsArtifactsDto({
      resultsArtifactsVersion: 1,
      resultsArtifactsReadyAt: null,
      resultsArtifactJob: {
        status: 'failed',
        summaryStatus: 'failed',
        photoStatus: 'skipped',
      },
    }).status,
    'failed'
  );

  console.log('gameResultsArtifact.dto.test.ts: ok');
}

run();
