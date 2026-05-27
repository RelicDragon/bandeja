import type { GamePhoto } from '@/api/gamePhotos';

type GamePhotoUrls = Pick<GamePhoto, 'thumbnailUrl' | 'originalUrl'>;

/** Grid / list thumbnails */
export function gamePhotoThumbnailUrl(photo: GamePhotoUrls): string {
  return photo.thumbnailUrl?.trim() || photo.originalUrl?.trim() || '';
}

/** Fullscreen viewer */
export function gamePhotoOriginalUrl(photo: GamePhotoUrls): string {
  return photo.originalUrl?.trim() || photo.thumbnailUrl?.trim() || '';
}

/** Photo has at least one usable URL */
export function hasGamePhotoUrl(photo: GamePhotoUrls): boolean {
  return !!(gamePhotoThumbnailUrl(photo) || gamePhotoOriginalUrl(photo));
}
