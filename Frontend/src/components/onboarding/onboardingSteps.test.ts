import { describe, expect, it } from 'vitest';
import type { User } from '@/types';
import {
  ONBOARDING_STEPS,
  hasDisplayName,
  isOnboardingStep,
  isSkippableStep,
  nextStep,
  parseOnboardingStep,
  previousStep,
  resolveResumeStep,
  stepPosition,
  stepProgress,
  visibleOnboardingSteps,
} from './onboardingSteps';

type ProfileBits = Pick<User, 'firstName' | 'lastName' | 'nameIsSet' | 'avatar'>;

const complete = { firstName: 'Ana', lastName: 'Petrović', nameIsSet: true, avatar: '/a.png' };
const anonymous = { firstName: '', lastName: '', nameIsSet: false, avatar: undefined };

describe('onboarding step vocabulary', () => {
  it('keeps the persisted ids stable', () => {
    // These strings live in `User.onboardingStep` and in the backend mirror.
    expect([...ONBOARDING_STEPS]).toEqual([
      'welcome',
      'sport',
      'profile',
      'level',
      'city',
      'follow',
      'notifications',
    ]);
  });

  it('parses only known ids', () => {
    expect(isOnboardingStep('city')).toBe(true);
    expect(isOnboardingStep('CITY')).toBe(false);
    expect(parseOnboardingStep('  follow ')).toBe('follow');
    expect(parseOnboardingStep('retired')).toBeNull();
    expect(parseOnboardingStep(undefined)).toBeNull();
  });

  it('allows skipping everything except Welcome and Sport', () => {
    expect(isSkippableStep('welcome')).toBe(false);
    expect(isSkippableStep('sport')).toBe(false);
    for (const step of ['profile', 'level', 'city', 'follow', 'notifications'] as const) {
      expect(isSkippableStep(step)).toBe(true);
    }
  });
});

describe('visibleOnboardingSteps', () => {
  it('drops the conditional name step when the account is already complete', () => {
    expect(visibleOnboardingSteps(complete as ProfileBits)).not.toContain('profile');
    expect(visibleOnboardingSteps(complete as ProfileBits)).toHaveLength(6);
  });

  it('inserts it right after Sport when the name or the photo is missing', () => {
    const noName = visibleOnboardingSteps(anonymous as ProfileBits);
    expect(noName).toHaveLength(7);
    expect(noName[1]).toBe('sport');
    expect(noName[2]).toBe('profile');

    const noPhoto = visibleOnboardingSteps({ ...complete, avatar: undefined } as ProfileBits);
    expect(noPhoto).toContain('profile');
  });

  it('treats a blank or unconfirmed name as no name', () => {
    expect(hasDisplayName({ firstName: '   ', nameIsSet: true } as ProfileBits)).toBe(false);
    expect(hasDisplayName({ firstName: 'Ana', nameIsSet: false } as ProfileBits)).toBe(false);
    expect(hasDisplayName(null)).toBe(false);
  });
});

describe('resolveResumeStep', () => {
  const visible = visibleOnboardingSteps(complete as ProfileBits);

  it('lands on the saved step', () => {
    expect(resolveResumeStep('city', visible)).toBe('city');
  });

  it('restarts on an unknown or missing value', () => {
    expect(resolveResumeStep('retired-step', visible)).toBe('welcome');
    expect(resolveResumeStep(null, visible)).toBe('welcome');
  });

  it('moves forward when the saved step is no longer shown', () => {
    // The name was set elsewhere between two visits, so `profile` is gone.
    expect(resolveResumeStep('profile', visible)).toBe('level');
  });

  it('handles the narrowed sport-only flow', () => {
    expect(resolveResumeStep('city', ['sport'])).toBe('sport');
    expect(resolveResumeStep(null, ['sport'])).toBe('sport');
  });
});

describe('progress reporting', () => {
  const visible = visibleOnboardingSteps(anonymous as ProfileBits);

  it('numbers the steps the account actually sees', () => {
    expect(stepPosition('welcome', visible)).toEqual({ current: 1, total: 7 });
    expect(stepPosition('level', visible)).toEqual({ current: 4, total: 7 });
    // The same step is "3 of 6" for an account that skips the profile step.
    expect(stepPosition('level', visibleOnboardingSteps(complete as ProfileBits))).toEqual({
      current: 3,
      total: 6,
    });
  });

  it('never reports an empty or overflowing bar', () => {
    expect(stepProgress('welcome', visible)).toBeGreaterThan(0);
    expect(stepProgress('notifications', visible)).toBe(1);
  });
});

describe('navigation', () => {
  const visible = visibleOnboardingSteps(complete as ProfileBits);

  it('walks forward and back over the visible steps only', () => {
    expect(nextStep('sport', visible)).toBe('level');
    expect(previousStep('level', visible)).toBe('sport');
  });

  it('has no step before the first or after the last', () => {
    expect(previousStep('welcome', visible)).toBeNull();
    expect(nextStep('notifications', visible)).toBeNull();
  });
});
