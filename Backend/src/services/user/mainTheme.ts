import type { MainTheme } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

export function validateMainThemeUpdate(value: unknown, isPremium: boolean): MainTheme | undefined {
  if (value === undefined) return undefined;
  if (value !== 'classic' && value !== 'premium') {
    throw new ApiError(400, 'Invalid mainTheme. Allowed: classic, premium');
  }
  if (!isPremium) {
    throw new ApiError(403, 'Premium membership is required to change the main theme');
  }
  return value;
}
