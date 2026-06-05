import { AdClickAction, AdCampaignStatus, AdPlacementKey, Sport } from '@prisma/client';
import { getVariantWeight, resolveCreative } from './ad.creative.resolve';
import { pickHighestPriorityTier, weightedPick } from './ad.pick.util';
import { AdDeliveryService } from './ad.delivery.service';
import {
  matchesExtendedTargeting,
  matchesLanguageFilter,
  matchesLevelBand,
  passesRolloutPercent,
} from './ad.targeting.util';
import { isFrequencyCapExceeded, isSnoozed } from './ad.userState.service';
import type { CachedAdCampaign } from './ad.cache';
import type { AdTargeting } from './ad.schemas';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function makeCampaign(overrides: Partial<CachedAdCampaign> & { id: string }): CachedAdCampaign {
  return {
    sponsorId: 'sp1',
    name: overrides.name ?? 'Campaign',
    status: AdCampaignStatus.ACTIVE,
    priority: 0,
    weight: 100,
    startsAt: null,
    endsAt: null,
    defaultLocale: 'en',
    frequencyCap: { maxImpressions: 3, windowDays: 7 },
    dismissible: true,
    dismissSnoozeDays: 3,
    clickUrlTrusted: true,
    disclosureLabel: null,
    hideDisclosure: false,
    targeting: { cityIds: ['city1'], sports: ['PADEL'] },
    testUserIds: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    sponsor: { id: 'sp1', name: 'Sponsor' },
    creatives: [
      {
        id: 'cr1',
        campaignId: overrides.id,
        placement: null,
        locale: 'en',
        variantKey: 'A',
        imageUrl: 'https://example.com/a.webp',
        imageUrlDark: null,
        title: 'T',
        subtitle: null,
        ctaLabel: null,
        clickUrl: 'https://example.com',
        clickAction: AdClickAction.OPEN_URL,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    placements: [{ campaignId: overrides.id, placement: AdPlacementKey.home_hero }],
    ...overrides,
  } as CachedAdCampaign;
}

// targeting filter
{
  const campaigns = [
    makeCampaign({ id: 'c1', targeting: { cityIds: ['city1'], sports: ['PADEL'] } }),
    makeCampaign({ id: 'c2', targeting: { cityIds: ['city2'], sports: ['PADEL'] } }),
    makeCampaign({ id: 'c3', targeting: { cityIds: ['city1'], sports: ['TENNIS'] } }),
    makeCampaign({ id: 'c4', targeting: { cityIds: ['city1'] } }),
  ];

  const eligible = AdDeliveryService.filterCampaigns(campaigns, {
    placement: AdPlacementKey.home_hero,
    userId: 'u1',
    cityId: 'city1',
    sport: Sport.PADEL,
    userStates: new Map(),
  });

  assert(eligible.length === 2, 'city+padel should match c1 and c4');
  assert(eligible.some((c) => c.id === 'c1'), 'c1 included');
  assert(eligible.some((c) => c.id === 'c4'), 'c4 included (all sports)');
}

// priority + weighted pick determinism
{
  const campaigns = [
    makeCampaign({ id: 'low', priority: 1, weight: 100 }),
    makeCampaign({ id: 'high-a', priority: 5, weight: 80 }),
    makeCampaign({ id: 'high-b', priority: 5, weight: 20 }),
  ];

  const tier = pickHighestPriorityTier(campaigns);
  assert(tier.length === 2, 'only highest priority tier');
  assert(tier.every((c) => c.priority === 5), 'tier priority 5');

  const pick1 = weightedPick(
    tier.map((c) => ({ id: c.id, weight: c.weight })),
    'session-abc:u1:home_hero:ctx1'
  );
  const pick2 = weightedPick(
    tier.map((c) => ({ id: c.id, weight: c.weight })),
    'session-abc:u1:home_hero:ctx1'
  );
  assert(pick1 === pick2, 'same seed → same pick');
  assert(pick1 === 'high-a' || pick1 === 'high-b', 'pick from tier');
}

// frequency cap + snooze
{
  const cap = { maxImpressions: 3, windowDays: 7 };
  const now = new Date('2026-06-06T12:00:00Z');
  assert(
    isFrequencyCapExceeded({ impressions: 3, capWindowStart: now, snoozedUntil: null }, cap, now),
    'cap exceeded at 3'
  );
  assert(
    !isFrequencyCapExceeded({ impressions: 2, capWindowStart: now, snoozedUntil: null }, cap, now),
    'under cap'
  );
  assert(
    isSnoozed({ impressions: 0, capWindowStart: null, snoozedUntil: new Date('2026-06-10') }, now),
    'snoozed'
  );
  assert(
    !isSnoozed({ impressions: 0, capWindowStart: null, snoozedUntil: new Date('2026-06-01') }, now),
    'snooze expired'
  );
}

// locale fallback chain
{
  const creatives = [
    {
      id: 'ru-specific',
      campaignId: 'c',
      placement: AdPlacementKey.find_top,
      locale: 'ru',
      variantKey: 'A',
      imageUrl: 'ru-pl.webp',
      imageUrlDark: null,
      title: null,
      subtitle: null,
      ctaLabel: null,
      clickUrl: '/x',
      clickAction: AdClickAction.OPEN_URL,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'en-default',
      campaignId: 'c',
      placement: null,
      locale: 'en',
      variantKey: 'A',
      imageUrl: 'en.webp',
      imageUrlDark: null,
      title: null,
      subtitle: null,
      ctaLabel: null,
      clickUrl: '/x',
      clickAction: AdClickAction.OPEN_URL,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  assert(
    resolveCreative(creatives, AdPlacementKey.find_top, 'ru', 'en')?.id === 'ru-specific',
    'placement+locale match'
  );
  assert(
    resolveCreative(creatives, AdPlacementKey.home_hero, 'ru', 'en')?.id === 'en-default',
    'fallback to default locale creative'
  );
  assert(
    resolveCreative(creatives, AdPlacementKey.find_top, 'es', 'en')?.id === 'en-default',
    'fallback defaultLocale via null placement'
  );
}

// testUserIds + DRAFT preview eligibility
{
  const draft = makeCampaign({
    id: 'draft',
    status: AdCampaignStatus.DRAFT,
    testUserIds: ['tester'],
    targeting: { cityIds: ['other-city'], sports: ['PADEL'] },
  });

  const forTester = AdDeliveryService.filterCampaigns([draft], {
    placement: AdPlacementKey.home_hero,
    userId: 'tester',
    cityId: 'city1',
    sport: Sport.PADEL,
    userStates: new Map(),
    allowDraft: true,
  });
  assert(forTester.length === 1, 'testUserIds sees DRAFT without city match');

  const forOther = AdDeliveryService.filterCampaigns([draft], {
    placement: AdPlacementKey.home_hero,
    userId: 'other',
    cityId: 'city1',
    sport: Sport.PADEL,
    userStates: new Map(),
  });
  assert(forOther.length === 0, 'non-test user excluded from DRAFT');
}

// Phase B: language filter
{
  const targeting: AdTargeting = { cityIds: ['c1'], languages: ['ru', 'sr'] };
  assert(matchesLanguageFilter(targeting, 'ru'), 'ru matches');
  assert(matchesLanguageFilter(targeting, 'ru-RU'), 'ru-RU matches ru');
  assert(!matchesLanguageFilter(targeting, 'en'), 'en excluded');
  assert(matchesLanguageFilter({ cityIds: ['c1'] }, 'en'), 'no languages = all');
}

// Phase B: level band
{
  const targeting: AdTargeting = {
    cityIds: ['c1'],
    levelBands: [{ min: 3.0, max: 7.0 }],
  };
  assert(matchesLevelBand(targeting, 3.5), '3.5 in band');
  assert(matchesLevelBand(targeting, 3.0), 'min inclusive');
  assert(matchesLevelBand(targeting, 7.0), 'max inclusive');
  assert(!matchesLevelBand(targeting, 2.9), 'below band');
  assert(matchesLevelBand({ cityIds: ['c1'] }, 1.0), 'no bands = all');
}

// Phase B: sport-scoped level band
{
  const targeting: AdTargeting = {
    cityIds: ['c1'],
    levelBands: [{ sport: Sport.PADEL, min: 3.0, max: 7.0 }],
  };
  assert(matchesLevelBand(targeting, 4.0, Sport.PADEL), 'padel band matches padel context');
  assert(matchesLevelBand(targeting, 4.0, Sport.TENNIS), 'padel band ignored for tennis context');
  assert(!matchesLevelBand(targeting, 2.0, Sport.PADEL), 'below padel band');
}

// Phase B: rollout %
{
  assert(passesRolloutPercent('user-a', 'camp-1', 100), '100% always passes');
  assert(!passesRolloutPercent('user-a', 'camp-1', 0), '0% never passes');
  const r1 = passesRolloutPercent('stable-user', 'stable-camp', 50);
  const r2 = passesRolloutPercent('stable-user', 'stable-camp', 50);
  assert(r1 === r2, 'rollout deterministic per user+campaign');
}

// Phase B: include/exclude via filterCampaigns
{
  const included = makeCampaign({
    id: 'inc',
    targeting: { cityIds: ['city1'], includeUserIds: ['vip1'] },
  });
  const excluded = makeCampaign({
    id: 'exc',
    targeting: { cityIds: ['city1'], excludeUserIds: ['blocked'] },
  });

  const vipEligible = AdDeliveryService.filterCampaigns([included], {
    placement: AdPlacementKey.home_hero,
    userId: 'vip1',
    cityId: 'city1',
    sport: Sport.PADEL,
    userStates: new Map(),
  });
  assert(vipEligible.length === 1, 'includeUserIds match');

  const nonVip = AdDeliveryService.filterCampaigns([included], {
    placement: AdPlacementKey.home_hero,
    userId: 'other',
    cityId: 'city1',
    sport: Sport.PADEL,
    userStates: new Map(),
  });
  assert(nonVip.length === 0, 'includeUserIds excludes others');

  const blocked = AdDeliveryService.filterCampaigns([excluded], {
    placement: AdPlacementKey.home_hero,
    userId: 'blocked',
    cityId: 'city1',
    sport: Sport.PADEL,
    userStates: new Map(),
  });
  assert(blocked.length === 0, 'excludeUserIds blocks user');
}

// Phase B: includeUserIds force delivery bypasses city/sport
{
  const forced = makeCampaign({
    id: 'force',
    targeting: { cityIds: ['city1'], includeUserIds: ['vip1'], languages: ['ru'] },
  });

  const vipWrongCity = AdDeliveryService.filterCampaigns([forced], {
    placement: AdPlacementKey.home_hero,
    userId: 'vip1',
    cityId: 'other-city',
    sport: Sport.PADEL,
    userLocale: 'en',
    userStates: new Map(),
  });
  assert(vipWrongCity.length === 1, 'force-included user bypasses city and language');

  const vipExcluded = makeCampaign({
    id: 'force-exc',
    targeting: {
      cityIds: ['city1'],
      includeUserIds: ['vip1'],
      excludeUserIds: ['vip1'],
    },
  });
  const blockedVip = AdDeliveryService.filterCampaigns([vipExcluded], {
    placement: AdPlacementKey.home_hero,
    userId: 'vip1',
    cityId: 'city1',
    sport: Sport.PADEL,
    userStates: new Map(),
  });
  assert(blockedVip.length === 0, 'exclude wins over force include');
}

// Phase B: extended targeting in filterCampaigns
{
  const langCampaign = makeCampaign({
    id: 'lang',
    targeting: { cityIds: ['city1'], languages: ['ru'] },
  });
  const ruUser = AdDeliveryService.filterCampaigns([langCampaign], {
    placement: AdPlacementKey.home_hero,
    userId: 'u1',
    cityId: 'city1',
    sport: Sport.PADEL,
    userLocale: 'ru',
    userStates: new Map(),
  });
  assert(ruUser.length === 1, 'language match in filter');

  const enUser = AdDeliveryService.filterCampaigns([langCampaign], {
    placement: AdPlacementKey.home_hero,
    userId: 'u1',
    cityId: 'city1',
    sport: Sport.PADEL,
    userLocale: 'en',
    userStates: new Map(),
  });
  assert(enUser.length === 0, 'language mismatch in filter');
}

// Phase B: variant weight pick
{
  const base = {
    campaignId: 'c',
    placement: null as AdPlacementKey | null,
    locale: 'en',
    imageUrlDark: null,
    title: null,
    subtitle: null,
    ctaLabel: null,
    clickUrl: '/x',
    clickAction: AdClickAction.OPEN_URL,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const variants = [
    {
      ...base,
      id: 'var-a',
      variantKey: 'A',
      imageUrl: 'a.webp',
      metadata: { variantWeight: 90 },
    },
    {
      ...base,
      id: 'var-b',
      variantKey: 'B',
      imageUrl: 'b.webp',
      metadata: { variantWeight: 10 },
    },
  ];

  assert(getVariantWeight(variants[0], undefined) === 90, 'metadata weight');
  assert(getVariantWeight(variants[1], { B: 50 }) === 10, 'metadata overrides campaign weights');

  const picked = resolveCreative(variants, AdPlacementKey.home_hero, 'en', 'en', {
    variantSeed: 'session:u1:home_hero:ctx:c:variant',
  });
  assert(picked?.id === 'var-a' || picked?.id === 'var-b', 'variant picked');

  const pickedAgain = resolveCreative(variants, AdPlacementKey.home_hero, 'en', 'en', {
    variantSeed: 'session:u1:home_hero:ctx:c:variant',
  });
  assert(picked?.id === pickedAgain?.id, 'variant pick stable per seed');

  const pinnedB = resolveCreative(variants, AdPlacementKey.home_hero, 'en', 'en', {
    variantKey: 'B',
  });
  assert(pinnedB?.id === 'var-b', 'variantKey pins creative for preview');
}

// Phase B: matchesExtendedTargeting composite
{
  const targeting: AdTargeting = {
    cityIds: ['c1'],
    languages: ['en'],
    levelBands: [{ min: 2.0, max: 4.0 }],
    rolloutPercent: 100,
    excludeUserIds: ['bad'],
  };
  assert(
    matchesExtendedTargeting(targeting, {
      userId: 'good',
      campaignId: 'c1',
      userLocale: 'en',
      userLevel: 3.0,
    }),
    'all extended filters pass'
  );
  assert(
    !matchesExtendedTargeting(targeting, {
      userId: 'bad',
      campaignId: 'c1',
      userLocale: 'en',
      userLevel: 3.0,
    }),
    'exclude blocks'
  );
}

console.log('ad.delivery tests: ok');
