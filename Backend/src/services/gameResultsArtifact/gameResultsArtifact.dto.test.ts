import assert from 'node:assert/strict';
import { buildResultsArtifactsDto } from './gameResultsArtifact.dto';
import { getMaxArtifactPhotoGenerations } from './gameResultsArtifact.photoLimit';

function run() {
  const readyAt = new Date('2026-05-25T12:00:00.000Z');
  const defaultMax = getMaxArtifactPhotoGenerations(false);

  assert.deepEqual(
    buildResultsArtifactsDto(
      {
        resultsArtifactsVersion: 2,
        resultsArtifactsReadyAt: readyAt,
        resultsArtifactJob: {
          status: 'running',
          summaryStatus: 'done',
          photoStatus: 'pending',
        },
      },
      defaultMax
    ),
    {
      status: 'done',
      version: 2,
      summaryReady: true,
      summaryInFlight: false,
      photoReady: false,
      photoInFlight: true,
      photoGenerationsUsed: 0,
      photoGenerationsRemaining: defaultMax,
      photoGenerationsMax: defaultMax,
      readyAt: readyAt.toISOString(),
    }
  );

  assert.deepEqual(
    buildResultsArtifactsDto(
      {
        resultsArtifactsVersion: 0,
        resultsArtifactsReadyAt: null,
        resultsArtifactJob: null,
      },
      defaultMax
    ),
    {
      status: 'none',
      version: 0,
      summaryReady: false,
      summaryInFlight: false,
      photoReady: false,
      photoInFlight: false,
      photoGenerationsUsed: 0,
      photoGenerationsRemaining: defaultMax,
      photoGenerationsMax: defaultMax,
      readyAt: null,
    }
  );

  assert.equal(
    buildResultsArtifactsDto(
      {
        resultsArtifactsVersion: 1,
        resultsArtifactsReadyAt: null,
        resultsArtifactJob: {
          status: 'pending',
          summaryStatus: 'pending',
          photoStatus: 'skipped',
        },
      },
      getMaxArtifactPhotoGenerations(true)
    ).photoGenerationsMax,
    5
  );

  assert.equal(
    buildResultsArtifactsDto(
      {
        resultsArtifactsVersion: 1,
        resultsArtifactsReadyAt: null,
        resultsArtifactJob: {
          status: 'pending',
          summaryStatus: 'pending',
          photoStatus: 'skipped',
        },
      },
      defaultMax
    ).status,
    'pending'
  );

  assert.equal(
    buildResultsArtifactsDto(
      {
        resultsArtifactsVersion: 1,
        resultsArtifactsReadyAt: null,
        resultsArtifactJob: {
          status: 'failed',
          summaryStatus: 'failed',
          photoStatus: 'skipped',
        },
      },
      defaultMax
    ).status,
    'failed'
  );

  console.log('gameResultsArtifact.dto.test.ts: ok');
}

run();
