import { AdLandingDonationIntent, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { AdCampaignCache } from './ad.cache';
import { verifyAdClickToken } from './ad.token.util';
import type { AdLandingKey } from './adLandingWish.constants';
import type { AdLandingWishCreateInput } from './adLandingWish.schemas';
import { notifyDevelopersAdLandingWish } from './adLandingWish.notify';

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

function isDonationIntent(intent: AdLandingDonationIntent): boolean {
  return intent === AdLandingDonationIntent.RSD || intent === AdLandingDonationIntent.RUB;
}

/**
 * Append user to campaign targeting.excludeUserIds so the ad stops showing after a donation.
 */
async function excludeUserFromCampaign(campaignId: string, userId: string): Promise<void> {
  const campaign = await prisma.adCampaign.findUnique({
    where: { id: campaignId },
    select: { targeting: true },
  });
  if (!campaign) return;

  const targeting =
    campaign.targeting && typeof campaign.targeting === 'object' && !Array.isArray(campaign.targeting)
      ? { ...(campaign.targeting as Record<string, unknown>) }
      : {};

  const existing = Array.isArray(targeting.excludeUserIds)
    ? targeting.excludeUserIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];

  if (existing.includes(userId)) return;

  await prisma.adCampaign.update({
    where: { id: campaignId },
    data: {
      targeting: {
        ...targeting,
        excludeUserIds: [...existing, userId],
      } as Prisma.InputJsonValue,
    },
  });

  AdCampaignCache.clearCache();
}

/**
 * Persist a landing wish. Valid `adToken` links user/campaign; missing/invalid token → anonymous wish.
 * Donation (RSD/RUB) with a linked user → add that user to the campaign's excludeUserIds.
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
  const donationIntent = input.donationIntent as AdLandingDonationIntent;

  const row = await prisma.adLandingWish.create({
    data: {
      landingKey,
      userId,
      campaignId,
      displayName: input.name.trim(),
      message: input.message.trim(),
      donationIntent,
      locale,
    },
  });

  if (userId && campaignId && isDonationIntent(donationIntent)) {
    await excludeUserFromCampaign(campaignId, userId);
  }

  const created: CreatedAdLandingWish = {
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

  void notifyDevelopersAdLandingWish(created).catch((err) => {
    console.error('[adLandingWish] developer Telegram notify failed:', err);
  });

  return created;
}
