import type { GamePhoto } from '@/api/gamePhotos';

/** Same URL order as the grid thumbnail — avoids opening a broken original in fullscreen. */
export function gamePhotoUrl(photo: Pick<GamePhoto, 'thumbnailUrl' | 'originalUrl'>): string {
  return photo.thumbnailUrl?.trim() || photo.originalUrl?.trim() || '';
}
