import { ApiError } from '../../utils/ApiError';

export const MAX_ARTIFACT_PHOTO_GENERATIONS = 3;

export function photoGenerationsRemaining(used: number): number {
  return Math.max(0, MAX_ARTIFACT_PHOTO_GENERATIONS - used);
}

export function assertPhotoGenerationsAvailable(used: number): void {
  if (used >= MAX_ARTIFACT_PHOTO_GENERATIONS) {
    throw new ApiError(
      400,
      `Photo generation limit reached (${MAX_ARTIFACT_PHOTO_GENERATIONS} per game)`
    );
  }
}
