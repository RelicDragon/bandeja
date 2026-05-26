import assert from 'node:assert/strict';
import {
  canSendResultsToTelegram,
  isPhotoReadyForTelegram,
  isResultsArtifactsPreparing,
  resolveTelegramResultsCta,
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
  assert.equal(resolveTelegramResultsCta(undefined, { hasSummaryText: false, hasGamePhoto: true }), 'prepare');
  assert.equal(
    resolveTelegramResultsCta(undefined, { hasSummaryText: true, hasGamePhoto: true }),
    'send'
  );

  assert.equal(
    resolveTelegramResultsCta(artifacts({ status: 'running', summaryReady: true, photoReady: false }), {
      hasSummaryText: false,
      hasGamePhoto: true,
    }),
    'send'
  );
  assert.equal(isPhotoReadyForTelegram(artifacts({ status: 'running', photoReady: false }), true), true);

  assert.equal(
    resolveTelegramResultsCta(artifacts({ status: 'running', summaryReady: false, photoReady: false }), {
      hasSummaryText: false,
      hasGamePhoto: true,
    }),
    'preparing'
  );
  assert.equal(isResultsArtifactsPreparing(artifacts({ status: 'running' }), false, true), true);

  assert.equal(
    resolveTelegramResultsCta(artifacts({ status: 'done', readyAt: '2026-01-01T00:00:00.000Z' }), {
      hasSummaryText: false,
      hasGamePhoto: false,
    }),
    'send'
  );

  assert.equal(
    resolveTelegramResultsCta(artifacts({ status: 'none' }), { hasSummaryText: true, hasGamePhoto: true }),
    'send'
  );
  assert.equal(
    resolveTelegramResultsCta(artifacts({ status: 'none' }), { hasSummaryText: false, hasGamePhoto: true }),
    'prepare'
  );

  assert.equal(
    resolveTelegramResultsCta(
      artifacts({ status: 'failed', summaryReady: true, photoReady: false }),
      { hasSummaryText: false, hasGamePhoto: true }
    ),
    'send'
  );
  assert.equal(canSendResultsToTelegram(artifacts({ status: 'failed' }), false, false), false);
  assert.equal(
    resolveTelegramResultsCta(artifacts({ status: 'failed', summaryReady: false }), {
      hasSummaryText: false,
      hasGamePhoto: false,
    }),
    'prepare'
  );

  console.log('gameResultsArtifacts.util.test.ts: ok');
}

run();
