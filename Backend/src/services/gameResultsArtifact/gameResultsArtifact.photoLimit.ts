import { ApiError } from '../../utils/ApiError';

export const ARTIFACT_PHOTO_GENERATIONS_MAX_DEFAULT = 2;
export const ARTIFACT_PHOTO_GENERATIONS_MAX_PREMIUM = 5;

/** @deprecated Use getMaxArtifactPhotoGenerations instead. */
export const MAX_ARTIFACT_PHOTO_GENERATIONS = ARTIFACT_PHOTO_GENERATIONS_MAX_DEFAULT;

export function getMaxArtifactPhotoGenerations(isPremium: boolean): number {
  return isPremium
    ? ARTIFACT_PHOTO_GENERATIONS_MAX_PREMIUM
    : ARTIFACT_PHOTO_GENERATIONS_MAX_DEFAULT;
}

export function photoGenerationsRemaining(used: number, max: number): number {
  return Math.max(0, max - used);
}

export function assertPhotoGenerationsAvailable(used: number, max: number): void {
  if (used >= max) {
    throw new ApiError(400, `Photo generation limit reached (${max} per game)`);
  }
}
