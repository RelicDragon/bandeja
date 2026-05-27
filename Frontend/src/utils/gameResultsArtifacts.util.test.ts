import assert from 'node:assert/strict';
import {
  canAccessResultsTelegramActions,
  canShowPhotoGenerationAction,
  hasEnteredResultsForTelegram,
  isAnyArtifactGenerating,
  isPhotoArtifactGenerating,
  isPhotoReadyForTelegram,
  isSummaryArtifactGenerating,
  isSummaryReadyForTelegram,
} from './gameResultsArtifacts.util';
import type { Game } from '@/types';
import type { GameResultsArtifacts } from '@/types';

function artifacts(partial: Partial<GameResultsArtifacts>): GameResultsArtifacts {
  return {
    status: 'none',
    version: 0,
    summaryReady: false,
    photoReady: false,
    photoInFlight: false,
    photoGenerationsUsed: 0,
    photoGenerationsRemaining: 3,
    photoGenerationsMax: 3,
    readyAt: null,
    ...partial,
  };
}

function run() {
  assert.equal(isSummaryReadyForTelegram(undefined, true), true);
  assert.equal(
    isSummaryReadyForTelegram(artifacts({ status: 'running', summaryReady: false }), false),
    false
  );
  assert.equal(
    isSummaryReadyForTelegram(artifacts({ status: 'running', summaryReady: true }), false),
    true
  );

  assert.equal(
    isSummaryArtifactGenerating(artifacts({ status: 'running', summaryReady: false }), false),
    true
  );
  assert.equal(
    isSummaryArtifactGenerating(artifacts({ status: 'running', summaryReady: true }), false),
    false
  );
  assert.equal(
    isPhotoArtifactGenerating(artifacts({ status: 'pending', photoInFlight: true })),
    true
  );
  assert.equal(isPhotoReadyForTelegram(artifacts({ photoReady: true }), false), false);
  assert.equal(
    canShowPhotoGenerationAction(
      artifacts({
        photoGenerationsRemaining: 1,
        photoInFlight: false,
      })
    ),
    true
  );
  assert.equal(
    canShowPhotoGenerationAction(
      artifacts({
        photoGenerationsRemaining: 0,
        photoInFlight: false,
      })
    ),
    false
  );
  assert.equal(
    isAnyArtifactGenerating(
      artifacts({ status: 'running', summaryReady: false, photoInFlight: true }),
      { hasSummaryText: false, hasGamePhoto: false }
    ),
    true
  );
  assert.equal(
    isAnyArtifactGenerating(
      artifacts({ status: 'done', summaryReady: true, photoReady: true }),
      { hasSummaryText: true, hasGamePhoto: true }
    ),
    false
  );

  assert.equal(hasEnteredResultsForTelegram({ resultsStatus: 'FINAL' }), true);
  assert.equal(
    hasEnteredResultsForTelegram({ resultsStatus: 'NONE', outcomes: [{ userId: 'u1' }] }),
    true
  );
  assert.equal(hasEnteredResultsForTelegram({ resultsStatus: 'NONE' }), false);

  const archivedGame = {
    id: 'g1',
    status: 'ARCHIVED',
    resultsStatus: 'FINAL',
    city: { telegramGroupId: '-1001' },
    participants: [{ userId: 'u1', status: 'PLAYING', role: 'OWNER' }],
  } as unknown as Game;
  assert.equal(
    canAccessResultsTelegramActions(archivedGame, { id: 'u1', isAdmin: false }),
    true
  );
  assert.equal(
    canAccessResultsTelegramActions(archivedGame, { id: 'other', isAdmin: false }),
    false
  );

  console.log('gameResultsArtifacts.util.test.ts: ok');
}

run();
