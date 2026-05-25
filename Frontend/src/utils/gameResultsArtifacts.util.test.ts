import assert from 'node:assert/strict';
import {
  canSendResultsToTelegram,
  isResultsArtifactsPreparing,
  resolveResultsArtifactsTelegramUiState,
} from './gameResultsArtifacts.util';
import type { GameResultsArtifacts } from '@/types';

function artifacts(
  partial: Partial<GameResultsArtifacts> & Pick<GameResultsArtifacts, 'status'>
): GameResultsArtifacts {
  return {
    version: 1,
    summaryReady: false,
    photoReady: false,
    readyAt: null,
    ...partial,
  };
}

function run() {
  assert.equal(resolveResultsArtifactsTelegramUiState(undefined), 'ready');
  assert.equal(canSendResultsToTelegram(undefined), true);

  assert.equal(
    resolveResultsArtifactsTelegramUiState(
      artifacts({ status: 'running', summaryReady: false })
    ),
    'preparing'
  );
  assert.equal(isResultsArtifactsPreparing(artifacts({ status: 'running' })), true);

  assert.equal(
    resolveResultsArtifactsTelegramUiState(
      artifacts({ status: 'done', readyAt: '2026-01-01T00:00:00.000Z' })
    ),
    'ready'
  );
  assert.equal(canSendResultsToTelegram(artifacts({ status: 'done', readyAt: '2026-01-01T00:00:00.000Z' })), true);

  assert.equal(
    resolveResultsArtifactsTelegramUiState(
      artifacts({ status: 'failed', summaryReady: true, photoReady: false })
    ),
    'failed_degraded'
  );
  assert.equal(
    canSendResultsToTelegram(
      artifacts({ status: 'failed', summaryReady: true }),
      false
    ),
    true
  );
  assert.equal(
    canSendResultsToTelegram(
      artifacts({ status: 'failed', summaryReady: false }),
      true
    ),
    true
  );

  assert.equal(
    resolveResultsArtifactsTelegramUiState(
      artifacts({ status: 'failed', summaryReady: false, photoReady: false })
    ),
    'failed'
  );
  assert.equal(canSendResultsToTelegram(artifacts({ status: 'failed' })), false);

  assert.equal(resolveResultsArtifactsTelegramUiState(artifacts({ status: 'none' })), 'preparing');

  console.log('gameResultsArtifacts.util.test.ts: ok');
}

run();
