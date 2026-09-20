import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_NAME_MAX_LENGTH,
  validateOnboardingFirstName,
  validateOnboardingLastName,
} from './nameValidation';

describe('onboarding name validation', () => {
  it('accepts a normal name', () => {
    expect(validateOnboardingFirstName('Ana')).toBeNull();
    expect(validateOnboardingFirstName('  Ana  ')).toBeNull();
  });

  it('requires a first name — the step is not skippable', () => {
    expect(validateOnboardingFirstName('')).toBe('onboarding.profile.nameRequired');
    expect(validateOnboardingFirstName('    ')).toBe('onboarding.profile.nameRequired');
  });

  it('rejects a single character', () => {
    expect(validateOnboardingFirstName('A')).toBe('onboarding.profile.nameTooShort');
  });

  it('rejects an over-long name', () => {
    const tooLong = 'a'.repeat(ONBOARDING_NAME_MAX_LENGTH + 1);
    expect(validateOnboardingFirstName(tooLong)).toBe('onboarding.profile.nameTooLong');
    expect(validateOnboardingFirstName('a'.repeat(ONBOARDING_NAME_MAX_LENGTH))).toBeNull();
  });

  it('treats the last name as optional but still bounded', () => {
    expect(validateOnboardingLastName('')).toBeNull();
    expect(validateOnboardingLastName('  ')).toBeNull();
    expect(validateOnboardingLastName('P')).toBeNull();
    expect(validateOnboardingLastName('b'.repeat(ONBOARDING_NAME_MAX_LENGTH + 1))).toBe(
      'onboarding.profile.nameTooLong',
    );
  });

  it('returns i18n keys, never English sentences', () => {
    expect(validateOnboardingFirstName('')).toMatch(/^onboarding\./);
  });
});
