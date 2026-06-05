import { AdCreative, AdPlacementKey } from '@prisma/client';
import { weightedPick } from './ad.pick.util';
import type { AdTargeting } from './ad.schemas';

type CreativeTier = {
  placement: AdPlacementKey | null;
  locale: string;
};

const TIERS: (ctx: { placement: AdPlacementKey; userLocale: string; defaultLocale: string }) => CreativeTier[] = (
  ctx
) => [
  { placement: ctx.placement, locale: ctx.userLocale },
  { placement: null, locale: ctx.userLocale },
  { placement: ctx.placement, locale: ctx.defaultLocale },
  { placement: null, locale: ctx.defaultLocale },
];

function matchesTier(creative: AdCreative, tier: CreativeTier): boolean {
  return creative.placement === tier.placement && creative.locale === tier.locale;
}

export function getVariantWeight(
  creative: AdCreative,
  campaignVariantWeights?: AdTargeting['variantWeights']
): number {
  const meta = creative.metadata as { variantWeight?: unknown } | null;
  if (meta && typeof meta.variantWeight === 'number' && meta.variantWeight > 0) {
    return meta.variantWeight;
  }
  const fromCampaign = campaignVariantWeights?.[creative.variantKey];
  if (typeof fromCampaign === 'number' && fromCampaign > 0) return fromCampaign;
  return 100;
}

export function collectCreativeCandidates(
  creatives: AdCreative[],
  placement: AdPlacementKey,
  userLocale: string,
  defaultLocale: string
): AdCreative[] {
  if (creatives.length === 0) return [];

  for (const tier of TIERS({ placement, userLocale, defaultLocale })) {
    const matches = creatives.filter((c) => matchesTier(c, tier));
    if (matches.length > 0) return matches;
  }

  return [creatives[0]];
}

export function resolveCreative(
  creatives: AdCreative[],
  placement: AdPlacementKey,
  userLocale: string,
  defaultLocale: string,
  opts?: {
    variantSeed?: string;
    variantWeights?: AdTargeting['variantWeights'];
    variantKey?: string;
  }
): AdCreative | null {
  const candidates = collectCreativeCandidates(creatives, placement, userLocale, defaultLocale);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (opts?.variantKey) {
    const pinned = candidates.find((c) => c.variantKey === opts.variantKey);
    if (pinned) return pinned;
  }

  if (!opts?.variantSeed) return candidates[0];

  const pickedId = weightedPick(
    candidates.map((c) => ({
      id: c.id,
      weight: getVariantWeight(c, opts.variantWeights),
    })),
    opts.variantSeed
  );
  return candidates.find((c) => c.id === pickedId) ?? candidates[0];
}
