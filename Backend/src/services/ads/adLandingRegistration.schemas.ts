import { z } from 'zod';
import {
  AD_LANDING_REGISTRATION_GUEST_CONTACT_MAX,
  AD_LANDING_REGISTRATION_GUEST_NAME_MAX,
  AD_LANDING_REGISTRATION_NOTE_MAX,
  isAdLandingRegistrationKey,
} from './adLandingRegistration.constants';

const registrationDetailsSchema = z.object({
  note: z.string().trim().max(AD_LANDING_REGISTRATION_NOTE_MAX).default(''),
  locale: z.string().trim().min(2).max(10).optional().nullable(),
});

const tokenRegistrationSchema = registrationDetailsSchema.extend({
  adToken: z.string().trim().min(16).max(512),
});

const guestRegistrationSchema = registrationDetailsSchema.extend({
  guestName: z.string().trim().min(1).max(AD_LANDING_REGISTRATION_GUEST_NAME_MAX),
  guestContact: z.string().trim().min(3).max(AD_LANDING_REGISTRATION_GUEST_CONTACT_MAX),
});

export const adLandingRegistrationCreateSchema = z.union([
  tokenRegistrationSchema,
  guestRegistrationSchema,
]);

export const adLandingRegistrationKeyParamSchema = z.string().trim().refine(
  isAdLandingRegistrationKey,
  { message: 'Unknown landing' }
);

export type AdLandingRegistrationCreateInput = z.infer<
  typeof adLandingRegistrationCreateSchema
>;
