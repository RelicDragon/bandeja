import { z } from 'zod';
import {
  AD_LANDING_DONATION_INTENTS,
  AD_LANDING_WISH_MESSAGE_MAX,
  AD_LANDING_WISH_NAME_MAX,
  isAdLandingKey,
} from './adLandingWish.constants';

export const adLandingWishCreateSchema = z.object({
  adToken: z.string().trim().min(1).max(512).optional().nullable(),
  name: z.string().trim().min(1).max(AD_LANDING_WISH_NAME_MAX),
  message: z.string().trim().min(1).max(AD_LANDING_WISH_MESSAGE_MAX),
  donationIntent: z.enum(AD_LANDING_DONATION_INTENTS).default('NONE'),
  locale: z.string().trim().min(2).max(10).optional().nullable(),
});

export const adLandingKeyParamSchema = z.string().trim().refine(isAdLandingKey, {
  message: 'Unknown landing',
});

export type AdLandingWishCreateInput = z.infer<typeof adLandingWishCreateSchema>;
