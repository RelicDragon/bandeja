export const AD_LANDING_MONTENEGRO_PADEL_2026 = 'montenegro_padel_2026';

export const AD_LANDING_REGISTRATION_KEYS = [AD_LANDING_MONTENEGRO_PADEL_2026] as const;
export type AdLandingRegistrationKey = (typeof AD_LANDING_REGISTRATION_KEYS)[number];

export function isAdLandingRegistrationKey(value: string): value is AdLandingRegistrationKey {
  return (AD_LANDING_REGISTRATION_KEYS as readonly string[]).includes(value);
}

export const AD_LANDING_REGISTRATION_NOTE_MAX = 1200;
export const AD_LANDING_REGISTRATION_GUEST_NAME_MAX = 120;
export const AD_LANDING_REGISTRATION_GUEST_CONTACT_MAX = 200;
