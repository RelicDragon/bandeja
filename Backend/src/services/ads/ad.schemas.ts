import { z } from 'zod';
import { AdCampaignStatus, AdClickAction, AdEventType, AdPlacementKey, Sport } from '@prisma/client';
import { AD_CLICK_SUPPORTED_LOCALES } from './ad.clickUrl.util';

export const DEFAULT_FREQUENCY_CAP = { maxImpressions: 3, windowDays: 7 } as const;

export const adLevelBandSchema = z.object({
  sport: z.nativeEnum(Sport).optional(),
  min: z.number().min(0).max(10),
  max: z.number().min(0).max(10),
});

export const adTargetingSchema = z.object({
  cityIds: z.array(z.string().min(1)).min(1),
  sports: z.array(z.nativeEnum(Sport)).optional(),
  languages: z.array(z.string().min(2).max(10)).optional(),
  levelBands: z.array(adLevelBandSchema).optional(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
  includeUserIds: z.array(z.string().min(1)).optional(),
  excludeUserIds: z.array(z.string().min(1)).optional(),
  variantWeights: z.record(z.string(), z.number().int().positive()).optional(),
});

export const adTargetingPresetTemplateSchema = z
  .object({
    cityIds: z.array(z.string().min(1)).default([]),
    cityNames: z.array(z.string().min(1)).optional(),
    allCities: z.boolean().optional(),
    sports: z.array(z.nativeEnum(Sport)).optional(),
    languages: z.array(z.string().min(2).max(10)).optional(),
    levelBands: z.array(adLevelBandSchema).optional(),
    rolloutPercent: z.number().int().min(0).max(100).optional(),
    includeUserIds: z.array(z.string().min(1)).optional(),
    excludeUserIds: z.array(z.string().min(1)).optional(),
    variantWeights: z.record(z.string(), z.number().int().positive()).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.cityIds.length === 0 &&
      (!data.cityNames || data.cityNames.length === 0) &&
      !data.allCities
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either cityIds, cityNames, or allCities is required',
        path: ['cityIds'],
      });
    }
  });

export const adTargetingPresetWriteSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).nullable().optional(),
  targeting: adTargetingPresetTemplateSchema,
});

export const frequencyCapSchema = z
  .object({
    maxImpressions: z.number().int().positive(),
    windowDays: z.number().int().positive(),
  })
  .nullable();

export const adPlacementKeySchema = z.nativeEnum(AdPlacementKey);

const supportedCalendarMessageLocales = new Set<string>(AD_CLICK_SUPPORTED_LOCALES);

export const adCalendarTagMessagesSchema = z
  .record(z.string(), z.string().trim().min(1).max(500))
  .superRefine((messages, ctx) => {
    for (const locale of Object.keys(messages)) {
      if (!supportedCalendarMessageLocales.has(locale)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported calendar tag message locale: ${locale}`,
          path: [locale],
        });
      }
    }
  });

export const adCampaignWriteBaseSchema = z.object({
  sponsorId: z.string().min(1),
  name: z.string().min(1).max(200),
  status: z.nativeEnum(AdCampaignStatus).optional(),
  priority: z.number().int().optional(),
  weight: z.number().int().positive().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  defaultLocale: z.string().min(2).max(10).optional(),
  frequencyCap: frequencyCapSchema.optional(),
  dismissible: z.boolean().optional(),
  dismissSnoozeDays: z.number().int().positive().nullable().optional(),
  clickUrlTrusted: z.boolean().optional(),
  appendUserNameToClickUrl: z.boolean().optional(),
  appendLocaleToClickUrl: z.boolean().optional(),
  appendThemeToClickUrl: z.boolean().optional(),
  appendAdTokenToClickUrl: z.boolean().optional(),
  disclosureLabel: z.string().max(100).nullable().optional(),
  hideDisclosure: z.boolean().optional(),
  calendarTagEnabled: z.boolean().optional(),
  calendarTagLabel: z.string().max(20).nullable().optional(),
  calendarTagColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  calendarTagMessages: adCalendarTagMessagesSchema.optional(),
  calendarTagStartsAt: z.coerce.date().nullable().optional(),
  calendarTagEndsAt: z.coerce.date().nullable().optional(),
  targeting: adTargetingSchema,
  testUserIds: z.array(z.string()).optional(),
  placements: z.array(adPlacementKeySchema).min(1),
});

type AdCalendarTagConfiguration = {
  calendarTagEnabled?: boolean;
  calendarTagLabel?: string | null;
  calendarTagColor?: string | null;
  calendarTagStartsAt?: Date | null;
  calendarTagEndsAt?: Date | null;
};

function validateEnabledCalendarTag(
  data: AdCalendarTagConfiguration,
  ctx: z.RefinementCtx,
): void {
  if (!data.calendarTagEnabled) return;

  if (!(data.calendarTagLabel ?? '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Calendar tag label is required when calendar tag is enabled',
      path: ['calendarTagLabel'],
    });
  }
  if (!data.calendarTagStartsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Calendar tag start date is required when calendar tag is enabled',
      path: ['calendarTagStartsAt'],
    });
  }
  if (!data.calendarTagEndsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Calendar tag end date is required when calendar tag is enabled',
      path: ['calendarTagEndsAt'],
    });
  }
  if (
    data.calendarTagStartsAt &&
    data.calendarTagEndsAt &&
    data.calendarTagEndsAt < data.calendarTagStartsAt
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Calendar tag end date must be on or after start date',
      path: ['calendarTagEndsAt'],
    });
  }
}

export const adCampaignWriteSchema = adCampaignWriteBaseSchema.superRefine(
  validateEnabledCalendarTag,
);

export const adCampaignPatchSchema = adCampaignWriteBaseSchema.partial().omit({ sponsorId: true }).superRefine((data, ctx) => {
  const calendarTagKeys = [
    'calendarTagEnabled',
    'calendarTagLabel',
    'calendarTagColor',
    'calendarTagMessages',
    'calendarTagStartsAt',
    'calendarTagEndsAt',
  ] as const;
  const touchesCalendarTag = calendarTagKeys.some((key) =>
    Object.prototype.hasOwnProperty.call(data, key),
  );
  if (!touchesCalendarTag) return;

  if (data.calendarTagEnabled === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Calendar tag updates must include the complete configuration',
      path: ['calendarTagEnabled'],
    });
    return;
  }

  validateEnabledCalendarTag(data, ctx);
});

export const adSponsorWriteSchema = z.object({
  name: z.string().min(1).max(200),
  contactEmail: z.string().email().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  clubId: z.string().nullable().optional(),
});

export const adCreativeWriteSchema = z.object({
  locale: z.string().min(2).max(10),
  placement: adPlacementKeySchema.nullable().optional(),
  variantKey: z.string().max(10).optional(),
  variantWeight: z.number().int().positive().optional(),
  title: z.string().max(200).nullable().optional(),
  subtitle: z.string().max(500).nullable().optional(),
  ctaLabel: z.string().max(100).nullable().optional(),
  clickUrl: z.string().min(1),
  clickAction: z.nativeEnum(AdClickAction).optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});

export const adDeliveryContextSchema = z.object({
  cityId: z.string().min(1).optional(),
  sportsByPlacement: z.record(adPlacementKeySchema, z.nativeEnum(Sport)).optional(),
  locale: z.string().min(2).max(10).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

export const adEventInputSchema = z.object({
  eventId: z.string().uuid(),
  type: z.nativeEnum(AdEventType),
  campaignId: z.string().min(1),
  creativeId: z.string().min(1),
  placement: adPlacementKeySchema,
  platform: z.string().max(32).optional(),
  cityId: z.string().optional(),
  sport: z.nativeEnum(Sport).optional(),
  locale: z.string().max(10).optional(),
});

export const adEventsBatchSchema = z.object({
  adSessionId: z.string().uuid().optional(),
  events: z.array(adEventInputSchema).min(1).max(20),
});

export type AdTargeting = z.infer<typeof adTargetingSchema>;
export type AdLevelBand = z.infer<typeof adLevelBandSchema>;
export type AdTargetingPresetTemplate = z.infer<typeof adTargetingPresetTemplateSchema>;
export type FrequencyCap = z.infer<typeof frequencyCapSchema>;
export type AdDeliveryContext = z.infer<typeof adDeliveryContextSchema>;
