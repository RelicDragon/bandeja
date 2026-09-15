import { canSeeCreatedGameInStories, canSeePhotoInStories, canSeeResultInStories } from './story.permissions';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const baseGame = {
  status: 'FINISHED',
  isPublic: true,
  resultsStatus: 'FINAL',
  forbidOthersPhotosView: false,
  participants: [{ userId: 'player', role: 'PARTICIPANT' }],
  parent: null,
};

const resultGame = {
  resultsStatus: 'FINAL',
  isPublic: true,
  resultsArtifactsReadyAt: new Date(),
};

function run(): void {
  assert(
    canSeePhotoInStories({
      viewerFollows: true,
      game: baseGame,
      uploader: { shareGamePhotosToFollowers: true },
      viewer: null,
    }),
    'open FINAL allows anonymous viewer in story gate',
  );

  assert(
    !canSeePhotoInStories({
      viewerFollows: true,
      game: { ...baseGame, forbidOthersPhotosView: true },
      uploader: { shareGamePhotosToFollowers: true },
      viewer: { id: 'stranger' },
    }),
    'forbidOthers denies stranger',
  );

  assert(
    canSeePhotoInStories({
      viewerFollows: true,
      game: { ...baseGame, forbidOthersPhotosView: true },
      uploader: { shareGamePhotosToFollowers: true },
      viewer: { id: 'player' },
    }),
    'forbidOthers allows participant',
  );

  assert(
    !canSeePhotoInStories({
      viewerFollows: true,
      game: { ...baseGame, resultsStatus: 'IN_PROGRESS' },
      uploader: { shareGamePhotosToFollowers: true },
      viewer: { id: 'player' },
    }),
    'not FINAL denies photo story segment',
  );

  assert(
    canSeeResultInStories({
      viewerFollows: true,
      game: resultGame,
      outcomeOwner: { shareGameResultsToFollowers: true },
      participant: { showInStories: true },
    }),
    'result story allowed when participant showInStories',
  );

  assert(
    !canSeeResultInStories({
      viewerFollows: true,
      game: resultGame,
      outcomeOwner: { shareGameResultsToFollowers: true },
      participant: { showInStories: false },
    }),
    'result story denied when participant hides stories',
  );

  assert(
    canSeeCreatedGameInStories({
      viewerFollows: true,
      game: { isPublic: true, status: 'ANNOUNCED', entityType: 'EVENT', eventApprovalStatus: 'APPROVED' },
      owner: { shareGameCreationsToFollowers: true },
    }),
    'approved EVENT creation stories are public',
  );

  assert(
    !canSeeCreatedGameInStories({
      viewerFollows: true,
      game: { isPublic: true, status: 'ANNOUNCED', entityType: 'EVENT', eventApprovalStatus: 'ON_APPROVE' },
      owner: { shareGameCreationsToFollowers: true },
    }),
    'pending EVENT creation stories stay hidden',
  );

  console.log('story.permissions.test.ts: all passed');
}

run();
