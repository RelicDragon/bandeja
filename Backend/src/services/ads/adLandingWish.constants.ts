export const AD_LANDING_LIZA_BIRTHDAY_2026 = 'liza_birthday_2026';

export const AD_LANDING_KEYS = [AD_LANDING_LIZA_BIRTHDAY_2026] as const;
export type AdLandingKey = (typeof AD_LANDING_KEYS)[number];

export function isAdLandingKey(value: string): value is AdLandingKey {
  return (AD_LANDING_KEYS as readonly string[]).includes(value);
}

export const AD_LANDING_WISH_NAME_MAX = 80;
export const AD_LANDING_WISH_MESSAGE_MAX = 1200;

export const AD_LANDING_DONATION_INTENTS = ['NONE', 'RSD', 'RUB'] as const;
export type AdLandingDonationIntentValue = (typeof AD_LANDING_DONATION_INTENTS)[number];
