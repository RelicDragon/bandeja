import { ApiError } from '../../utils/ApiError';

export function validateShowPremiumStatusUpdate(value: unknown, isPremium: boolean): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new ApiError(400, 'Invalid showPremiumStatus. Expected a boolean');
  }
  if (!isPremium) {
    throw new ApiError(403, 'Premium membership is required to change premium status visibility');
  }
  return value;
}
