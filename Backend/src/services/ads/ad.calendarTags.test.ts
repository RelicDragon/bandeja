import { AdCampaignStatus, AdClickAction, AdPlacementKey, Sport } from '@prisma/client';
import type { CachedAdCampaign } from './ad.cache';
import { AdCampaignCache } from './ad.cache';
import { deserializeCachedAdCampaigns } from './ad.cache.redis';
import { AdDeliveryService } from './ad.delivery.service';
import { adCampaignPatchSchema, adCampaignWriteSchema } from './ad.schemas';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function makeCampaign(overrides: Partial<CachedAdCampaign> = {}): CachedAdCampaign {
  return {
    id: 'calendar-campaign',
    sponsorId: 'sponsor-1',
    name: 'Calendar campaign',
    status: AdCampaignStatus.ACTIVE,
    priority: 0,
    weight: 100,
    startsAt: null,
    endsAt: null,
    defaultLocale: 'en',
    frequencyCap: null,
    dismissible: true,
    dismissSnoozeDays: 7,
    clickUrlTrusted: true,
    appendUserNameToClickUrl: false,
    appendLocaleToClickUrl: false,
    appendThemeToClickUrl: false,
    appendAdTokenToClickUrl: false,
    disclosureLabel: null,
    hideDisclosure: false,
    calendarTagEnabled: true,
    calendarTagLabel: 'CAMP',
    calendarTagColor: '#7C3AED',
    calendarTagMessages: {
      en: 'English camp details',
      ru: 'Описание кэмпа',
      sr: 'Detalji kampa',
    },
    calendarTagStartsAt: new Date('2026-09-05T00:00:00.000Z'),
    calendarTagEndsAt: new Date('2026-09-07T00:00:00.000Z'),
    targeting: { cityIds: ['city-1'] },
    testUserIds: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    sponsor: { id: 'sponsor-1', name: 'Sponsor' },
    creatives: [
      {
        id: 'creative-1',
        campaignId: 'calendar-campaign',
        placement: null,
        locale: 'en',
        variantKey: 'A',
        imageUrl: 'https://example.com/ad.webp',
        imageUrlDark: null,
        imageUrls: ['https://example.com/ad.webp'],
        imageUrlsDark: [],
        title: null,
        subtitle: null,
        ctaLabel: null,
        clickUrl: 'https://example.com',
        clickAction: AdClickAction.OPEN_URL,
        metadata: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ],
    placements: [
      { campaignId: 'calendar-campaign', placement: AdPlacementKey.home_hero },
    ],
    ...overrides,
  } as CachedAdCampaign;
}

function campaignPayload() {
  return {
    sponsorId: 'sponsor-1',
    name: 'Calendar campaign',
    targeting: { cityIds: ['city-1'] },
    placements: [AdPlacementKey.home_hero],
  };
}

async function main() {
  const cached = deserializeCachedAdCampaigns(JSON.stringify([makeCampaign()]));
  assert(cached[0]?.calendarTagStartsAt instanceof Date, 'Redis hydration restores calendar start date');
  assert(cached[0]?.calendarTagEndsAt instanceof Date, 'Redis hydration restores calendar end date');

  const createWithoutRange = adCampaignWriteSchema.safeParse({
    ...campaignPayload(),
    calendarTagEnabled: true,
    calendarTagLabel: 'CAMP',
  });
  assert(!createWithoutRange.success, 'enabled calendar tag requires both range dates');

  const invalidPatch = adCampaignPatchSchema.safeParse({
    calendarTagEnabled: true,
    calendarTagLabel: null,
    calendarTagStartsAt: null,
    calendarTagEndsAt: null,
  });
  assert(!invalidPatch.success, 'campaign PATCH rejects enabled tag without label and dates');

  const partialRangePatch = adCampaignPatchSchema.safeParse({
    calendarTagStartsAt: '2026-09-08',
  });
  assert(!partialRangePatch.success, 'campaign PATCH rejects partial calendar tag configuration');

  const invalidColor = adCampaignWriteSchema.safeParse({
    ...campaignPayload(),
    calendarTagEnabled: true,
    calendarTagLabel: 'CAMP',
    calendarTagColor: 'purple',
    calendarTagStartsAt: '2026-09-05',
    calendarTagEndsAt: '2026-09-07',
  });
  assert(!invalidColor.success, 'calendar tag color must be a six-digit hex color');

  const invalidMessageLocale = adCampaignWriteSchema.safeParse({
    ...campaignPayload(),
    calendarTagMessages: { fr: 'Unsupported locale' },
  });
  assert(!invalidMessageLocale.success, 'calendar tag messages reject unsupported locales');

  const originalGetCampaigns = AdCampaignCache.getCampaigns;
  try {
    AdCampaignCache.getCampaigns = async () => [makeCampaign({ creatives: [] })];
    const withoutCreative = await AdDeliveryService.resolveCalendarTags(
      'user-1',
      { cityId: 'city-1' },
      'en',
      undefined,
    );
    assert(withoutCreative.length === 0, 'tag requires a campaign with a deliverable creative');

    AdCampaignCache.getCampaigns = async () => [makeCampaign({
      targeting: { cityIds: ['city-1'], sports: [Sport.TENNIS] },
      placements: [
        { campaignId: 'calendar-campaign', placement: AdPlacementKey.find_top },
      ],
    })];
    const tennisFindTag = await AdDeliveryService.resolveCalendarTags(
      'user-1',
      {
        cityId: 'city-1',
        sportsByPlacement: {
          [AdPlacementKey.home_hero]: Sport.PADEL,
          [AdPlacementKey.find_top]: Sport.TENNIS,
          [AdPlacementKey.leaderboard_banner]: Sport.PADEL,
        },
      },
      'en',
      Sport.PADEL,
    );
    assert(tennisFindTag.length === 1, 'tag uses the actual sport registered for its placement');

    AdCampaignCache.getCampaigns = async () => cached;
    const hydratedTags = await AdDeliveryService.resolveCalendarTags(
      'user-1',
      { cityId: 'city-1' },
      'en',
      undefined,
    );
    assert(hydratedTags.length === 1, 'Redis-hydrated ranged tag resolves');
    assert(hydratedTags[0]?.color === '#7C3AED', 'API returns the configured font color');
    assert(hydratedTags[0]?.message === 'English camp details', 'API resolves the viewer locale message');
    assert(hydratedTags[0]?.startsAt === '2026-09-05', 'API returns a date-only start boundary');
    assert(hydratedTags[0]?.endsAt === '2026-09-07', 'API returns a date-only end boundary');

    const russianTags = await AdDeliveryService.resolveCalendarTags(
      'user-1',
      { cityId: 'city-1' },
      'ru-RU',
      undefined,
    );
    assert(russianTags[0]?.message === 'Описание кэмпа', 'API normalizes regional viewer locales');

    AdCampaignCache.getCampaigns = async () => [makeCampaign({
      defaultLocale: 'sr',
      calendarTagMessages: { sr: 'Detalji kampa' },
    })];
    const fallbackTags = await AdDeliveryService.resolveCalendarTags(
      'user-1',
      { cityId: 'city-1' },
      'ja',
      undefined,
    );
    assert(fallbackTags[0]?.message === 'Detalji kampa', 'API falls back to campaign default locale');
  } finally {
    AdCampaignCache.getCampaigns = originalGetCampaigns;
  }

  console.log('ad calendar tag tests: ok');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
