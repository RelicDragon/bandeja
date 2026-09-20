/**
 * PRD 350 — inline validation for the conditional name step.
 *
 * Photo is skippable, the name is not: a nameless player is unreadable on a
 * game roster. Returns an i18n key so the message stays translated.
 */
export const ONBOARDING_NAME_MIN_LENGTH = 2;
export const ONBOARDING_NAME_MAX_LENGTH = 30;

export type NameValidationError =
  | 'onboarding.profile.nameRequired'
  | 'onboarding.profile.nameTooShort'
  | 'onboarding.profile.nameTooLong';

export function validateOnboardingFirstName(raw: string): NameValidationError | null {
  const value = raw.trim();
  if (value.length === 0) return 'onboarding.profile.nameRequired';
  if (value.length < ONBOARDING_NAME_MIN_LENGTH) return 'onboarding.profile.nameTooShort';
  if (value.length > ONBOARDING_NAME_MAX_LENGTH) return 'onboarding.profile.nameTooLong';
  return null;
}

/** The last name is optional, but it still has to fit the column. */
export function validateOnboardingLastName(raw: string): NameValidationError | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (value.length > ONBOARDING_NAME_MAX_LENGTH) return 'onboarding.profile.nameTooLong';
  return null;
}
