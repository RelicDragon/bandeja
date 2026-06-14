import { canSeePhotoInStories } from './story.permissions';

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

  console.log('story.permissions.test.ts: all passed');
}

run();
