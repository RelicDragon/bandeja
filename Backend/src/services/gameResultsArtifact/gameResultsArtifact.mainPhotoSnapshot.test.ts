import assert from 'node:assert/strict';
import { shouldSetAiAsMainPhoto } from './gameResultsArtifact.mainPhotoSnapshot';

function run() {
  const snapshot = { userPhotoCountAtEnqueue: 0, mainPhotoIdAtEnqueue: null };

  assert.equal(
    shouldSetAiAsMainPhoto(snapshot, { photosCount: 0, mainPhotoId: null }),
    true,
    'empty game at enqueue and now'
  );

  assert.equal(
    shouldSetAiAsMainPhoto(snapshot, { photosCount: 1, mainPhotoId: 'p1' }),
    false,
    'user uploaded after enqueue'
  );

  assert.equal(
    shouldSetAiAsMainPhoto(
      { userPhotoCountAtEnqueue: 2, mainPhotoIdAtEnqueue: 'main-a' },
      { photosCount: 2, mainPhotoId: 'main-a' }
    ),
    false,
    'had photos at enqueue'
  );

  assert.equal(
    shouldSetAiAsMainPhoto(
      { userPhotoCountAtEnqueue: 1, mainPhotoIdAtEnqueue: 'main-a' },
      { photosCount: 1, mainPhotoId: 'main-b' }
    ),
    false,
    'main changed after enqueue'
  );

  assert.equal(
    shouldSetAiAsMainPhoto(
      { userPhotoCountAtEnqueue: 0, mainPhotoIdAtEnqueue: null },
      { photosCount: 1, mainPhotoId: 'ai-1' }
    ),
    false,
    'count drift without matching snapshot count'
  );

  console.log('gameResultsArtifact.mainPhotoSnapshot.test.ts: ok');
}

run();
