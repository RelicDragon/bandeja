export function canSeeManualStory(viewerFollows: boolean): boolean {
  return viewerFollows;
}

export function canSeePhotoInStories(opts: {
  viewerFollows: boolean;
  game: { status: string; isPublic: boolean };
  uploader: { shareGamePhotosToFollowers: boolean };
}): boolean {
  if (!opts.viewerFollows) return false;
  if (!opts.uploader.shareGamePhotosToFollowers) return false;
  if (!opts.game.isPublic) return false;
  return opts.game.status === 'FINISHED' || opts.game.status === 'ARCHIVED';
}

export function canSeeCreatedGameInStories(opts: {
  viewerFollows: boolean;
  game: { isPublic: boolean; status: string; entityType: string };
  owner: { shareGameCreationsToFollowers: boolean };
}): boolean {
  if (!opts.viewerFollows) return false;
  if (!opts.owner.shareGameCreationsToFollowers) return false;
  if (!opts.game.isPublic) return false;
  if (opts.game.status !== 'ANNOUNCED') return false;
  if (opts.game.entityType === 'LEAGUE_SEASON') return false;
  return true;
}

export function canSeeResultInStories(opts: {
  viewerFollows: boolean;
  game: { resultsStatus: string; isPublic: boolean };
  outcomeOwner: { shareGameResultsToFollowers: boolean };
}): boolean {
  if (!opts.viewerFollows) return false;
  if (!opts.outcomeOwner.shareGameResultsToFollowers) return false;
  if (!opts.game.isPublic) return false;
  return opts.game.resultsStatus === 'FINAL';
}
