#!/usr/bin/env ts-node
/**
 * Ads: targeting, events idempotency, impression increments.
 * Run: DB_URL=... npx ts-node -r dotenv/config scripts/tests/ads.ts
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';
import {
  AdCampaignStatus,
  AdClickAction,
  AdEventType,
  AdPlacementKey,
  Sport,
} from '@prisma/client';
import { AdEventService } from '../../src/services/ads/ad.event.service';
import { AdDeliveryService } from '../../src/services/ads/ad.delivery.service';
import { AdCampaignCache } from '../../src/services/ads/ad.cache';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function ensureDbUrl() {
  let url = process.env.DB_URL;
  if (!url) return false;
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
  return true;
}

async function main() {
  dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

  if (!ensureDbUrl()) {
    console.log('ads: skipped (set DB_URL)');
    process.exit(0);
  }

  const suffix = `${Date.now()}`;
  const { default: prisma } = await import('../../src/config/database');

  let city = await prisma.city.findFirst({ select: { id: true } });
  if (!city) {
    city = await prisma.city.create({
      data: { name: `AdQA ${suffix}`, country: 'QA', timezone: 'UTC', isCorrect: true },
      select: { id: true },
    });
  }

  const user = await prisma.user.create({
    data: {
      firstName: 'AdQA',
      lastName: suffix,
      nameIsSet: true,
      currentCityId: city.id,
      primarySport: Sport.PADEL,
    },
    select: { id: true },
  });

  const sponsor = await prisma.adSponsor.create({
    data: { name: `Sponsor ${suffix}` },
  });

  const campaign = await prisma.adCampaign.create({
    data: {
      sponsorId: sponsor.id,
      name: `Campaign ${suffix}`,
      status: AdCampaignStatus.ACTIVE,
      priority: 10,
      weight: 100,
      targeting: { cityIds: [city.id], sports: ['PADEL'] },
      frequencyCap: { maxImpressions: 3, windowDays: 7 },
      dismissSnoozeDays: 2,
      placements: { create: [{ placement: AdPlacementKey.home_hero }] },
    },
  });

  const creative = await prisma.adCreative.create({
    data: {
      campaignId: campaign.id,
      locale: 'en',
      imageUrl: 'https://cdn.example/test.webp',
      clickUrl: 'https://example.com',
      clickAction: AdClickAction.OPEN_URL,
    },
  });

  await AdCampaignCache.refreshCache();

  const adSessionId = randomUUID();
  const resolved = await AdDeliveryService.resolvePlacements(
    user.id,
    adSessionId,
    [AdPlacementKey.home_hero],
    { cityId: city.id, sportsByPlacement: { home_hero: Sport.PADEL } },
    'en',
    Sport.PADEL
  );

  assert(!!resolved.home_hero, 'resolves active campaign');
  assert(resolved.home_hero!.campaignId === campaign.id, 'correct campaign');

  const session2 = randomUUID();
  const again = await AdDeliveryService.resolvePlacements(
    user.id,
    session2,
    [AdPlacementKey.home_hero],
    { cityId: city.id, sportsByPlacement: { home_hero: Sport.TENNIS } },
    'en',
    Sport.PADEL
  );
  assert(!again.home_hero, 'tennis filter excludes padel-only campaign');

  const eventId = randomUUID();
  const batch1 = await AdEventService.recordBatch(user.id, {
    adSessionId,
    events: [
      {
        eventId,
        type: AdEventType.IMPRESSION,
        campaignId: campaign.id,
        creativeId: creative.id,
        placement: AdPlacementKey.home_hero,
      },
    ],
  });
  assert(batch1.accepted === 1 && batch1.duplicates === 0, 'first event accepted');

  const batch2 = await AdEventService.recordBatch(user.id, {
    events: [
      {
        eventId,
        type: AdEventType.IMPRESSION,
        campaignId: campaign.id,
        creativeId: creative.id,
        placement: AdPlacementKey.home_hero,
      },
    ],
  });
  assert(batch2.duplicates === 1 && batch2.accepted === 0, 'duplicate eventId idempotent');

  const state = await prisma.adUserState.findUnique({
    where: { userId_campaignId: { userId: user.id, campaignId: campaign.id } },
  });
  assert(state?.impressions === 1, 'impression increments user state');

  await AdEventService.recordBatch(user.id, {
    events: [
      {
        eventId: randomUUID(),
        type: AdEventType.DISMISS,
        campaignId: campaign.id,
        creativeId: creative.id,
        placement: AdPlacementKey.home_hero,
      },
    ],
  });

  const snoozed = await prisma.adUserState.findUnique({
    where: { userId_campaignId: { userId: user.id, campaignId: campaign.id } },
  });
  assert(!!snoozed?.snoozedUntil && snoozed.snoozedUntil > new Date(), 'dismiss sets snooze');

  // DRAFT + testUserIds preview
  const draftCampaign = await prisma.adCampaign.create({
    data: {
      sponsorId: sponsor.id,
      name: `Draft ${suffix}`,
      status: AdCampaignStatus.DRAFT,
      testUserIds: [user.id],
      targeting: { cityIds: [city.id], sports: ['PADEL'] },
      placements: { create: [{ placement: AdPlacementKey.find_top }] },
    },
  });
  await prisma.adCreative.create({
    data: {
      campaignId: draftCampaign.id,
      locale: 'en',
      imageUrl: 'https://cdn.example/draft.webp',
      clickUrl: 'https://example.com/draft',
      clickAction: AdClickAction.OPEN_URL,
    },
  });
  await AdCampaignCache.refreshCache();

  const preview = await AdDeliveryService.preview(
    draftCampaign.id,
    user.id,
    AdPlacementKey.find_top,
    'en',
    { cityId: city.id, sportsByPlacement: { find_top: Sport.PADEL } },
    Sport.PADEL,
  );
  assert(!!preview && preview.campaignId === draftCampaign.id, 'DRAFT preview for testUserIds');

  await prisma.adCreative.deleteMany({ where: { campaignId: draftCampaign.id } });
  await prisma.adCampaignPlacement.deleteMany({ where: { campaignId: draftCampaign.id } });
  await prisma.adCampaign.delete({ where: { id: draftCampaign.id } });
  await AdCampaignCache.refreshCache();

  // all three placements + sport context refetch
  const multiCampaign = await prisma.adCampaign.create({
    data: {
      sponsorId: sponsor.id,
      name: `Multi ${suffix}`,
      status: AdCampaignStatus.ACTIVE,
      targeting: { cityIds: [city.id], sports: ['PADEL'] },
      placements: {
        create: [
          { placement: AdPlacementKey.home_hero },
          { placement: AdPlacementKey.find_top },
          { placement: AdPlacementKey.leaderboard_banner },
        ],
      },
    },
  });
  await prisma.adCreative.create({
    data: {
      campaignId: multiCampaign.id,
      locale: 'en',
      imageUrl: 'https://cdn.example/multi.webp',
      clickUrl: 'https://example.com/multi',
      clickAction: AdClickAction.OPEN_URL,
    },
  });
  await AdCampaignCache.refreshCache();

  const allPlacements = await AdDeliveryService.resolvePlacements(
    user.id,
    randomUUID(),
    [AdPlacementKey.home_hero, AdPlacementKey.find_top, AdPlacementKey.leaderboard_banner],
    {
      cityId: city.id,
      sportsByPlacement: {
        home_hero: Sport.PADEL,
        find_top: Sport.PADEL,
        leaderboard_banner: Sport.PADEL,
      },
    },
    'en',
    Sport.PADEL,
  );
  assert(!!allPlacements.home_hero, 'home_hero resolves');
  assert(!!allPlacements.find_top, 'find_top resolves');
  assert(!!allPlacements.leaderboard_banner, 'leaderboard_banner resolves');

  const sportFiltered = await AdDeliveryService.resolvePlacements(
    user.id,
    randomUUID(),
    [AdPlacementKey.find_top],
    { cityId: city.id, sportsByPlacement: { find_top: Sport.TENNIS } },
    'en',
    Sport.PADEL,
  );
  assert(!sportFiltered.find_top, 'sport context change excludes padel-only campaign on find_top');

  await prisma.adEvent.deleteMany({ where: { campaignId: multiCampaign.id } });
  await prisma.adSessionPick.deleteMany({ where: { campaignId: multiCampaign.id } });
  await prisma.adCreative.deleteMany({ where: { campaignId: multiCampaign.id } });
  await prisma.adCampaignPlacement.deleteMany({ where: { campaignId: multiCampaign.id } });
  await prisma.adCampaign.delete({ where: { id: multiCampaign.id } });

  await prisma.adEvent.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.adUserState.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.adSessionPick.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.adCreative.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.adCampaignPlacement.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.adCampaign.delete({ where: { id: campaign.id } });
  await prisma.adSponsor.delete({ where: { id: sponsor.id } });
  await prisma.user.delete({ where: { id: user.id } });

  console.log('ads integration: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
