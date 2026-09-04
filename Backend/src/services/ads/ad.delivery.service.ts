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
import {
  AD_CLICK_SUPPORTED_LOCALES,
  normalizeAdClickLocale,
  personalizeClickUrl,
  resolveAdClickUserName,
} from './ad.clickUrl.util';
import type { AdClickUrlPersonalizationValues } from './ad.clickUrl.util';
import { mintAdClickToken } from './ad.token.util';
import { resolveAdDisclosureLabel } from './ad.disclosure.util';

export type ResolvedCalendarTag = {
  campaignId: string;
  label: string;
  color: string;
  message: string | null;
  startsAt: string;
  endsAt: string;
};

const DEFAULT_CALENDAR_TAG_COLOR = '#7C3AED';

function resolveCalendarTagColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)
    ? value.toUpperCase()
    : DEFAULT_CALENDAR_TAG_COLOR;
}

function resolveCalendarTagMessage(
  value: unknown,
  userLocale: string,
  defaultLocale: string,
): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const messages = value as Record<string, unknown>;
  const candidates = [
    normalizeAdClickLocale(userLocale),
    normalizeAdClickLocale(defaultLocale),
    'en',
    ...AD_CLICK_SUPPORTED_LOCALES,
  ];
  const visited = new Set<string>();
  for (const locale of candidates) {
    if (!locale || visited.has(locale)) continue;
    visited.add(locale);
    const message = messages[locale];
    if (typeof message !== 'string' || !message.trim()) continue;
    return message.trim().slice(0, 500);
  }
  return null;
}

export type ResolvedAdCard = {
  placement: AdPlacementKey;
  campaignId: string;
  creativeId: string;
  sponsorId: string;
  sponsorName: string;
  imageUrl: string;
  imageUrlDark: string | null;
  imageUrls: string[];
  imageUrlsDark: string[];
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

export function resolveAdImageSets(creative: {
  imageUrl: string;
  imageUrlDark: string | null;
  imageUrls?: string[];
  imageUrlsDark?: string[];
}): { imageUrls: string[]; imageUrlsDark: string[] } {
  return {
    imageUrls: creative.imageUrls?.length ? creative.imageUrls : [creative.imageUrl],
    imageUrlsDark: creative.imageUrlsDark?.length
      ? creative.imageUrlsDark
      : creative.imageUrlDark
        ? [creative.imageUrlDark]
        : [],
  };
}

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
      ignoreSnoozeAndCap?: boolean;
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
      if (!opts.ignoreSnoozeAndCap) {
        if (isSnoozed(state, now)) return false;

        const cap = parseFrequencyCap(c.frequencyCap);
        if (isFrequencyCapExceeded(state, cap, now)) return false;
      }

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

  static async buildResolvedCard(
    campaign: CachedAdCampaign,
    creative: ReturnType<typeof resolveCreative> extends infer T ? NonNullable<T> : never,
    placement: AdPlacementKey,
    personalization: AdClickUrlPersonalizationValues | undefined,
    userId: string
  ): Promise<ResolvedAdCard> {
    const appendAdTokenToClickUrl = Boolean(campaign.appendAdTokenToClickUrl);
    let adToken: string | null = null;
    if (appendAdTokenToClickUrl) {
      try {
        adToken = await mintAdClickToken({ userId, campaignId: campaign.id });
      } catch (err) {
        console.error('[ads] ad_token mint failed', {
          campaignId: campaign.id,
          userId,
          err,
        });
      }
    }

    const imageSets = resolveAdImageSets(creative);

    return {
      placement,
      campaignId: campaign.id,
      creativeId: creative.id,
      sponsorId: campaign.sponsor.id,
      sponsorName: campaign.sponsor.name,
      imageUrl: creative.imageUrl,
      imageUrlDark: creative.imageUrlDark,
      ...imageSets,
      title: creative.title,
      subtitle: creative.subtitle,
      ctaLabel: creative.ctaLabel,
      clickUrl: personalizeClickUrl(
        creative.clickUrl,
        {
          appendUserNameToClickUrl: Boolean(campaign.appendUserNameToClickUrl),
          appendLocaleToClickUrl: Boolean(campaign.appendLocaleToClickUrl),
          appendThemeToClickUrl: Boolean(campaign.appendThemeToClickUrl),
          appendAdTokenToClickUrl: Boolean(adToken),
        },
        { ...(personalization ?? {}), adToken }
      ),
      clickAction: creative.clickAction,
      dismissible: campaign.dismissible,
      dismissSnoozeDays: campaign.dismissSnoozeDays,
      clickUrlTrusted: campaign.clickUrlTrusted,
      disclosureLabel: resolveAdDisclosureLabel(campaign.disclosureLabel, creative.metadata),
      hideDisclosure: campaign.hideDisclosure,
    };
  }

  static async resolvePlacements(
    userId: string,
    adSessionId: string,
    placementKeys: AdPlacementKey[],
    context: AdDeliveryContext,
    userLocale: string,
    primarySport: Sport | undefined,
    displayName?: string | null
  ): Promise<Partial<Record<AdPlacementKey, ResolvedAdCard>>> {
    const campaigns = await AdCampaignCache.getCampaigns();
    const campaignIds = campaigns.map((c) => c.id);
    const userStates = await loadUserStates(userId, campaignIds);
    const personalization: AdClickUrlPersonalizationValues = {
      userName: displayName ?? null,
      locale: userLocale,
      theme: context.theme ?? null,
    };

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
            result[placement] = await this.buildResolvedCard(campaign, creative, placement, personalization, userId);
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

      try {
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
      } catch {
        // Concurrent resolve can race on unique(adSessionId,userId,placement,contextKey).
      }

      result[placement] = await this.buildResolvedCard(campaign, creative, placement, personalization, userId);
    }

    return result;
  }

  static async resolveCalendarTags(
    userId: string,
    context: AdDeliveryContext,
    userLocale: string,
    primarySport: Sport | undefined,
  ): Promise<ResolvedCalendarTag[]> {
    const campaigns = await AdCampaignCache.getCampaigns();
    const tagCandidates = campaigns.filter(
      (c) =>
        Boolean((c as { calendarTagEnabled?: boolean }).calendarTagEnabled) &&
        typeof (c as { calendarTagLabel?: unknown }).calendarTagLabel === 'string' &&
        ((c as { calendarTagLabel?: string }).calendarTagLabel ?? '').trim().length > 0,
    );
    if (tagCandidates.length === 0) return [];

    // A calendar tag follows the same placement, creative, city, sport, language,
    // level and rollout eligibility as an ad. Delivery history is intentionally
    // ignored so dismissing or frequency-capping the card does not remove the tag.
    const userLevelBySport = new Map<Sport, number | undefined>();
    const eligibleIds = new Set<string>();
    const emptyStates = new Map<string, { impressions: number; capWindowStart: Date | null; snoozedUntil: Date | null }>();

    for (const placement of Object.values(AdPlacementKey)) {
      const sport = resolveSportForPlacement(placement, context.sportsByPlacement, primarySport);
      let userLevel: number | undefined;
      const needsUserLevel = sport && tagCandidates.some((campaign) => {
        if (!campaign.placements.some((configured) => configured.placement === placement)) {
          return false;
        }
        const parsed = adTargetingSchema.safeParse(campaign.targeting);
        return parsed.success && Boolean(parsed.data.levelBands?.length);
      });
      if (needsUserLevel && sport) {
        if (userLevelBySport.has(sport)) {
          userLevel = userLevelBySport.get(sport);
        } else {
          userLevel = await resolveUserLevelForSport(userId, sport);
          userLevelBySport.set(sport, userLevel);
        }
      }

      const eligible = this.filterCampaigns(tagCandidates, {
        placement,
        userId,
        cityId: context.cityId,
        sport,
        userLocale,
        userLevel,
        userStates: emptyStates,
        ignoreSnoozeAndCap: true,
      });
      for (const campaign of eligible) {
        const targeting = campaign.targeting as AdTargeting;
        const creative = resolveCreative(
          campaign.creatives,
          placement,
          userLocale,
          campaign.defaultLocale,
          {
            variantSeed: `calendar-tag:${userId}:${placement}:${campaign.id}`,
            variantWeights: targeting.variantWeights,
          },
        );
        if (creative) eligibleIds.add(campaign.id);
      }
    }

    const out: ResolvedCalendarTag[] = [];
    for (const campaign of tagCandidates) {
      if (!eligibleIds.has(campaign.id)) continue;
      const c = campaign as typeof campaign & {
        calendarTagLabel: string | null;
        calendarTagColor: string | null;
        calendarTagMessages: unknown;
        calendarTagStartsAt: Date | string | null;
        calendarTagEndsAt: Date | string | null;
      };
      const label = (c.calendarTagLabel ?? '').trim().toUpperCase().slice(0, 20);
      const startsAt = toCalendarDayKey(c.calendarTagStartsAt);
      const endsAt = toCalendarDayKey(c.calendarTagEndsAt);
      if (!label || !startsAt || !endsAt || endsAt < startsAt) continue;
      out.push({
        campaignId: campaign.id,
        label,
        color: resolveCalendarTagColor(c.calendarTagColor),
        message: resolveCalendarTagMessage(c.calendarTagMessages, userLocale, campaign.defaultLocale),
        startsAt,
        endsAt,
      });
    }

    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
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

    let userName: string | null = null;
    if (Boolean(campaign.appendUserNameToClickUrl)) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      userName = resolveAdClickUserName(user?.firstName, user?.lastName);
    }

    return this.buildResolvedCard(campaign, creative, placement, {
      userName,
      locale,
      theme: context.theme ?? null,
    }, userId);
  }
}

function toCalendarDayKey(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
