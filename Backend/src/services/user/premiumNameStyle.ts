import { PremiumNameStyle } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

const PREMIUM_NAME_STYLES: readonly string[] = Object.values(PremiumNameStyle);

function isPremiumNameStyle(value: unknown): value is PremiumNameStyle {
  return typeof value === 'string' && PREMIUM_NAME_STYLES.includes(value);
}

/** Public name decoration — any `PremiumNameStyle` value; changing it requires premium. */
export function validatePremiumNameStyleUpdate(value: unknown, isPremium: boolean): PremiumNameStyle | undefined {
  if (value === undefined) return undefined;
  if (!isPremiumNameStyle(value)) {
    throw new ApiError(400, `Invalid premiumNameStyle. Allowed: ${PREMIUM_NAME_STYLES.join(', ')}`);
  }
  if (!isPremium) {
    throw new ApiError(403, 'Premium membership is required to change the name style');
  }
  return value;
}
