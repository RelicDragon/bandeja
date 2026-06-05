import {
  AdCampaignStatus,
  AdPlacementKey,
  Sport,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { AdCampaignCache, CachedAdCampaign } from './ad.cache';
import { resolveCreative } from './ad.creative.resolve';
import { buildContextKey, resolveSportForPlacement } from './ad.context.util';
import { pickHighestPriorityTier, weightedPick } from './ad.pick.util';
import {
  AdDeliveryContext,
  AdTargeting,
  adTargetingSchema,
} from './ad.schemas';
import { isForceIncludedUser, matchesExtendedTargeting, matchesIncludeExclude } from './ad.targeting.util';
import { resolveUserLevelForSport } from './ad.userLevel.util';
import {
  isFrequencyCapExceeded,
  isSnoozed,
  loadUserStates,
  parseFrequencyCap,
} from './ad.userState.service';

export type ResolvedAdCard = {
  placement: AdPlacementKey;
  campaignId: string;
  creativeId: string;
  sponsorId: string;
  sponsorName: string;
  imageUrl: string;
  imageUrlDark: string | null;
  title: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  clickUrl: string;
  clickAction: string;
  dismissible: boolean;
  dismissSnoozeDays: number | null;
  clickUrlTrusted: boolean;
  disclosureLabel: string | null;
  hideDisclosure: boolean;
};

export class AdDeliveryService {
  static filterCampaigns(
    campaigns: CachedAdCampaign[],
    opts: {
      placement: AdPlacementKey;
      userId: string;
      cityId: string | undefined;
      sport: Sport | undefined;
      userLocale?: string;
      userLevel?: number;
      userStates: Map<string, { impressions: number; capWindowStart: Date | null; snoozedUntil: Date | null }>;
      previewCampaignId?: string;
      allowDraft?: boolean;
    }
  ): CachedAdCampaign[] {
    const now = new Date();
    return campaigns.filter((c) => {
      if (opts.previewCampaignId && c.id === opts.previewCampaignId) {
        return c.placements.some((p) => p.placement === opts.placement);
      }

      const isTestUser = c.testUserIds.includes(opts.userId);
      if (c.status === AdCampaignStatus.DRAFT) {
        if (!isTestUser && !opts.allowDraft) return false;
      } else if (c.status !== AdCampaignStatus.ACTIVE) {
        return false;
      }

      if (!c.placements.some((p) => p.placement === opts.placement)) return false;
      if (c.creatives.length === 0) return false;

      const targeting = c.targeting as AdTargeting;
      const parsed = adTargetingSchema.safeParse(targeting);
      if (!parsed.success) return false;
      if (!matchesIncludeExclude(parsed.data, opts.userId)) return false;

      const forceIncluded = isForceIncludedUser(parsed.data, opts.userId);
      if (!forceIncluded && (!isTestUser || c.status === AdCampaignStatus.ACTIVE)) {
        if (!opts.cityId || !parsed.data.cityIds.includes(opts.cityId)) return false;

        const sports = parsed.data.sports;
        if (sports && sports.length > 0) {
          if (!opts.sport || !sports.includes(opts.sport)) return false;
        }

        if (
          !matchesExtendedTargeting(parsed.data, {
            userId: opts.userId,
            campaignId: c.id,
            userLocale: opts.userLocale,
            userLevel: opts.userLevel,
            sport: opts.sport,
          })
        ) {
          return false;
        }
      }

      const state = opts.userStates.get(c.id);
      if (isSnoozed(state, now)) return false;

      const cap = parseFrequencyCap(c.frequencyCap);
      if (isFrequencyCapExceeded(state, cap, now)) return false;

      return true;
    });
  }

  static pickCampaignId(
    eligible: CachedAdCampaign[],
    seed: string
  ): string | null {
    const tier = pickHighestPriorityTier(eligible);
    return weightedPick(
      tier.map((c) => ({ id: c.id, weight: c.weight })),
      seed
    );
  }

  static buildResolvedCard(
    campaign: CachedAdCampaign,
    creative: ReturnType<typeof resolveCreative> extends infer T ? NonNullable<T> : never,
    placement: AdPlacementKey
  ): ResolvedAdCard {
    return {
      placement,
      campaignId: campaign.id,
      creativeId: creative.id,
      sponsorId: campaign.sponsor.id,
      sponsorName: campaign.sponsor.name,
      imageUrl: creative.imageUrl,
      imageUrlDark: creative.imageUrlDark,
      title: creative.title,
      subtitle: creative.subtitle,
      ctaLabel: creative.ctaLabel,
      clickUrl: creative.clickUrl,
      clickAction: creative.clickAction,
      dismissible: campaign.dismissible,
      dismissSnoozeDays: campaign.dismissSnoozeDays,
      clickUrlTrusted: campaign.clickUrlTrusted,
      disclosureLabel: campaign.disclosureLabel,
      hideDisclosure: campaign.hideDisclosure,
    };
  }

  static async resolvePlacements(
    userId: string,
    adSessionId: string,
    placementKeys: AdPlacementKey[],
    context: AdDeliveryContext,
    userLocale: string,
    primarySport: Sport | undefined
  ): Promise<Partial<Record<AdPlacementKey, ResolvedAdCard>>> {
    const campaigns = await AdCampaignCache.getCampaigns();
    const campaignIds = campaigns.map((c) => c.id);
    const userStates = await loadUserStates(userId, campaignIds);

    const result: Partial<Record<AdPlacementKey, ResolvedAdCard>> = {};
    const userLevelBySport = new Map<Sport, number | undefined>();

    for (const placement of placementKeys) {
      const sport = resolveSportForPlacement(
        placement,
        context.sportsByPlacement,
        primarySport
      );
      const cityId = context.cityId;
      const contextKey = buildContextKey(cityId, sport);

      let userLevel: number | undefined;
      if (sport) {
        if (userLevelBySport.has(sport)) {
          userLevel = userLevelBySport.get(sport);
        } else {
          userLevel = await resolveUserLevelForSport(userId, sport);
          userLevelBySport.set(sport, userLevel);
        }
      }

      const existingPick = await prisma.adSessionPick.findUnique({
        where: {
          adSessionId_userId_placement_contextKey: {
            adSessionId,
            userId,
            placement,
            contextKey,
          },
        },
      });

      if (existingPick) {
        const campaign = campaigns.find((c) => c.id === existingPick.campaignId);
        if (campaign) {
          const targeting = campaign.targeting as AdTargeting;
          const variantSeed = `${adSessionId}:${userId}:${placement}:${contextKey}:${campaign.id}:variant`;
          const creative = resolveCreative(
            campaign.creatives,
            placement,
            userLocale,
            campaign.defaultLocale,
            { variantSeed, variantWeights: targeting.variantWeights }
          );
          const stillEligible = this.filterCampaigns([campaign], {
            placement,
            userId,
            cityId,
            sport,
            userLocale,
            userLevel,
            userStates,
          });
          if (creative && stillEligible.length > 0) {
            result[placement] = this.buildResolvedCard(campaign, creative, placement);
            continue;
          }
        }
        await prisma.adSessionPick
          .delete({
            where: {
              adSessionId_userId_placement_contextKey: {
                adSessionId,
                userId,
                placement,
                contextKey,
              },
            },
          })
          .catch(() => undefined);
      }

      const eligible = this.filterCampaigns(campaigns, {
        placement,
        userId,
        cityId,
        sport,
        userLocale,
        userLevel,
        userStates,
      });

      const seed = `${adSessionId}:${userId}:${placement}:${contextKey}`;
      const pickedId = this.pickCampaignId(eligible, seed);
      if (!pickedId) continue;

      const campaign = eligible.find((c) => c.id === pickedId)!;
      const targeting = campaign.targeting as AdTargeting;
      const variantSeed = `${seed}:${campaign.id}:variant`;
      const creative = resolveCreative(
        campaign.creatives,
        placement,
        userLocale,
        campaign.defaultLocale,
        { variantSeed, variantWeights: targeting.variantWeights }
      );
      if (!creative) continue;

      await prisma.adSessionPick.create({
        data: {
          adSessionId,
          userId,
          placement,
          contextKey,
          campaignId: campaign.id,
          creativeId: creative.id,
        },
      });

      result[placement] = this.buildResolvedCard(campaign, creative, placement);
    }

    return result;
  }

  static async preview(
    campaignId: string,
    userId: string,
    placement: AdPlacementKey,
    locale: string,
    context: AdDeliveryContext,
    primarySport: Sport | undefined,
    variantKey?: string
  ): Promise<ResolvedAdCard | null> {
    const campaigns = await AdCampaignCache.getCampaigns();
    let campaign = campaigns.find((c) => c.id === campaignId);

    if (!campaign) {
      const fromDb = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
        include: {
          creatives: true,
          placements: true,
          sponsor: { select: { id: true, name: true } },
        },
      });
      if (!fromDb) throw new ApiError(404, 'Campaign not found');
      campaign = fromDb;
    }

    const sport = resolveSportForPlacement(placement, context.sportsByPlacement, primarySport);
    const userStates = await loadUserStates(userId, [campaign.id]);

    const userLevel = await resolveUserLevelForSport(userId, sport);

    const eligible = this.filterCampaigns([campaign], {
      placement,
      userId,
      cityId: context.cityId,
      sport,
      userLocale: locale,
      userLevel,
      userStates,
      previewCampaignId: campaignId,
      allowDraft: true,
    });

    if (eligible.length === 0) return null;

    const targeting = campaign.targeting as AdTargeting;
    const variantSeed = `preview:${userId}:${placement}:${locale}:${campaignId}:variant`;
    const creative = resolveCreative(campaign.creatives, placement, locale, campaign.defaultLocale, {
      variantSeed,
      variantWeights: targeting.variantWeights,
      variantKey,
    });
    if (!creative) return null;

    return this.buildResolvedCard(campaign, creative, placement);
  }
}
