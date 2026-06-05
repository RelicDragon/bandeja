import { AdEventType, AdPlacementKey, Sport } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { adEventsBatchSchema } from './ad.schemas';
import { parseFrequencyCap, recordDismiss, recordImpression } from './ad.userState.service';

type AdEventDefaults = {
  cityId?: string;
  locale?: string;
  primarySport?: Sport;
  resolveSport?: (placement: AdPlacementKey) => Sport | undefined;
};

export class AdEventService {
  static async recordBatch(
    userId: string | undefined,
    body: unknown,
    defaults?: AdEventDefaults
  ): Promise<{ accepted: number; duplicates: number }> {
    const parsed = adEventsBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.message);
    }

    const { events } = parsed.data;
    let accepted = 0;
    let duplicates = 0;

    for (const evt of events) {
      const existing = await prisma.adEvent.findUnique({
        where: { eventId: evt.eventId },
        select: { id: true },
      });
      if (existing) {
        duplicates += 1;
        continue;
      }

      const campaign = await prisma.adCampaign.findUnique({
        where: { id: evt.campaignId },
        select: {
          id: true,
          frequencyCap: true,
          dismissSnoozeDays: true,
          dismissible: true,
        },
      });
      if (!campaign) {
        throw new ApiError(400, `Unknown campaign: ${evt.campaignId}`);
      }

      await prisma.adEvent.create({
        data: {
          eventId: evt.eventId,
          type: evt.type,
          campaignId: evt.campaignId,
          creativeId: evt.creativeId,
          placement: evt.placement,
          userId: userId ?? null,
          adSessionId: parsed.data.adSessionId ?? null,
          platform: evt.platform ?? null,
          cityId: evt.cityId ?? defaults?.cityId ?? null,
          sport:
            evt.sport ??
            defaults?.resolveSport?.(evt.placement) ??
            defaults?.primarySport ??
            null,
          locale: evt.locale ?? defaults?.locale ?? null,
        },
      });
      accepted += 1;

      if (userId) {
        if (evt.type === AdEventType.IMPRESSION) {
          const cap = parseFrequencyCap(campaign.frequencyCap);
          await recordImpression(userId, campaign.id, cap);
        } else if (evt.type === AdEventType.DISMISS && campaign.dismissible) {
          await recordDismiss(userId, campaign.id, campaign.dismissSnoozeDays);
        }
      }
    }

    return { accepted, duplicates };
  }
}
