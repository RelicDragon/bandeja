import { AdLandingDonationIntent } from '@prisma/client';
import prisma from '../../config/database';
import { verifyAdClickToken } from './ad.token.util';
import type { AdLandingKey } from './adLandingWish.constants';
import type { AdLandingWishCreateInput } from './adLandingWish.schemas';

export type CreatedAdLandingWish = {
  id: string;
  landingKey: string;
  userId: string | null;
  campaignId: string | null;
  displayName: string;
  message: string;
  donationIntent: AdLandingDonationIntent;
  locale: string | null;
  createdAt: Date;
};

/**
 * Persist a landing wish. Valid `adToken` links user/campaign; missing/invalid token → anonymous wish.
 */
export async function createAdLandingWish(
  landingKey: AdLandingKey,
  input: AdLandingWishCreateInput
): Promise<CreatedAdLandingWish> {
  let userId: string | null = null;
  let campaignId: string | null = null;

  const rawToken = input.adToken?.trim() || null;
  if (rawToken) {
    const claims = await verifyAdClickToken(rawToken);
    if (claims) {
      userId = claims.userId;
      campaignId = claims.campaignId;
    }
  }

  const locale = input.locale?.trim() || null;

  const row = await prisma.adLandingWish.create({
    data: {
      landingKey,
      userId,
      campaignId,
      displayName: input.name.trim(),
      message: input.message.trim(),
      donationIntent: input.donationIntent as AdLandingDonationIntent,
      locale,
    },
  });

  return {
    id: row.id,
    landingKey: row.landingKey,
    userId: row.userId,
    campaignId: row.campaignId,
    displayName: row.displayName,
    message: row.message,
    donationIntent: row.donationIntent,
    locale: row.locale,
    createdAt: row.createdAt,
  };
}
