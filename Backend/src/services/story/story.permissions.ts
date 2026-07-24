import {
  canViewGamePhotos,
  type GamePhotosPermissionGame,
  type GamePhotosViewer,
} from '../../shared/gamePhotos/permissions';

export function canSeeManualStory(viewerFollows: boolean): boolean {
  return viewerFollows;
}

export function canSeePhotoInStories(opts: {
  viewerFollows: boolean;
  game: GamePhotosPermissionGame & { status: string; isPublic: boolean };
  uploader: { shareGamePhotosToFollowers: boolean };
  viewer?: GamePhotosViewer | null;
}): boolean {
  if (!opts.viewerFollows) return false;
  if (!opts.uploader.shareGamePhotosToFollowers) return false;
  if (!opts.game.isPublic) return false;
  if (!canViewGamePhotos(opts.game, opts.viewer)) return false;
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
  game: {
    resultsStatus: string;
    isPublic: boolean;
    resultsArtifactsReadyAt: Date | null;
  };
  outcomeOwner: { shareGameResultsToFollowers: boolean };
  participant: { showInStories: boolean };
}): boolean {
  if (!opts.viewerFollows) return false;
  if (!opts.outcomeOwner.shareGameResultsToFollowers) return false;
  if (!opts.participant.showInStories) return false;
  if (!opts.game.isPublic) return false;
  return (
    opts.game.resultsStatus === 'FINAL' && opts.game.resultsArtifactsReadyAt != null
  );
}

export function canSeeBracketChampionInStories(opts: {
  viewerFollows: boolean;
  game: { isPublic: boolean };
  owner: { shareGameResultsToFollowers: boolean };
  participant: { showInStories: boolean };
}): boolean {
  if (!opts.viewerFollows) return false;
  if (!opts.owner.shareGameResultsToFollowers) return false;
  if (!opts.participant.showInStories) return false;
  return opts.game.isPublic;
}
