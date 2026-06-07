import assert from 'node:assert/strict';
import {
  canAccessResultsTelegramActions,
  canShowPhotoGenerationAction,
  gamePhotoFieldsChanged,
  getPhotoGenerationsMax,
  hasEnteredResultsForTelegram,
  isAnyArtifactGenerating,
  isPhotoArtifactGenerating,
  isPhotoReadyForTelegram,
  isSummaryArtifactGenerating,
  isSummaryReadyForTelegram,
  shouldMergeSelfGameSocketUpdate,
} from './gameResultsArtifacts.util';
import type { Game } from '@/types';
import type { GameResultsArtifacts } from '@/types';

function artifacts(partial: Partial<GameResultsArtifacts>): GameResultsArtifacts {
  return {
    status: 'none',
    version: 0,
    summaryReady: false,
    summaryInFlight: false,
    photoReady: false,
    photoInFlight: false,
    photoGenerationsUsed: 0,
    photoGenerationsRemaining: 2,
    photoGenerationsMax: 2,
    readyAt: null,
    ...partial,
  };
}

function run() {
  assert.equal(getPhotoGenerationsMax(false), 2);
  assert.equal(getPhotoGenerationsMax(true), 5);

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
    isSummaryArtifactGenerating(
      artifacts({ status: 'running', summaryReady: false, summaryInFlight: true }),
      false
    ),
    true
  );
  assert.equal(
    isSummaryArtifactGenerating(
      artifacts({ status: 'running', summaryReady: true, summaryInFlight: true }),
      false
    ),
    false
  );
  assert.equal(
    isAnyArtifactGenerating(
      artifacts({ status: 'running', summaryReady: false, photoInFlight: false }),
      { hasSummaryText: false }
    ),
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

  const baseGame = {
    photosCount: 1,
    mainPhotoId: 'photo-1',
    mainPhoto: { id: 'photo-1', thumbnailUrl: '/t1.jpg', originalUrl: '/o1.jpg' },
    resultsArtifacts: artifacts({ version: 2, readyAt: '2026-01-01T00:00:00.000Z' }),
  };
  assert.equal(
    gamePhotoFieldsChanged(baseGame, { ...baseGame, mainPhotoId: 'photo-2' }),
    true
  );
  assert.equal(
    shouldMergeSelfGameSocketUpdate(baseGame, {
      ...baseGame,
      mainPhotoId: 'photo-2',
      photosCount: 2,
    }),
    true
  );
  assert.equal(
    shouldMergeSelfGameSocketUpdate(baseGame, baseGame),
    true
  );
  assert.equal(shouldMergeSelfGameSocketUpdate(baseGame, baseGame, true), true);

  console.log('gameResultsArtifacts.util.test.ts: ok');
}

run();
