import { MainTheme } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

const MAIN_THEMES: readonly string[] = Object.values(MainTheme);

function isMainTheme(value: unknown): value is MainTheme {
  return typeof value === 'string' && MAIN_THEMES.includes(value);
}

/** Every `MainTheme` value is accepted; changing it (even back to `classic`) requires premium. */
export function validateMainThemeUpdate(value: unknown, isPremium: boolean): MainTheme | undefined {
  if (value === undefined) return undefined;
  if (!isMainTheme(value)) {
    throw new ApiError(400, `Invalid mainTheme. Allowed: ${MAIN_THEMES.join(', ')}`);
  }
  if (!isPremium) {
    throw new ApiError(403, 'Premium membership is required to change the main theme');
  }
  return value;
}
