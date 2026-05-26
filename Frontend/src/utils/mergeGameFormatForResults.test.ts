import assert from 'node:assert/strict';
import { mergeShellFieldsIntoEngineGame } from './mergeGameFormatForResults';
import type { Game } from '@/types';

function minimalGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    gameType: 'FRIENDLY',
    city: {} as Game['city'],
    startTime: '',
    endTime: '',
    maxParticipants: 4,
    minParticipants: 2,
    isPublic: false,
    affectsRating: false,
    allowDirectJoin: false,
    status: 'FINISHED',
    resultsStatus: 'FINAL',
    participants: [],
    ...overrides,
  } as Game;
}

function run() {
  const engine = minimalGame();
  const shell = minimalGame({
    resultsArtifacts: {
      status: 'running',
      version: 2,
      summaryReady: true,
      photoReady: false,
      readyAt: null,
    },
    resultsSummaryText: 'Cached summary',
    photosCount: 1,
  });

  const merged = mergeShellFieldsIntoEngineGame(shell, engine);
  assert.equal(merged.resultsArtifacts?.status, 'running');
  assert.equal(merged.resultsSummaryText, 'Cached summary');
  assert.equal(merged.photosCount, 1);

  console.log('mergeGameFormatForResults.test.ts: ok');
}

run();
