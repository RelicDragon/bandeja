import { describe, expect, it } from 'vitest';
import type { OnboardingStatus } from '@/api/onboarding';
import {
  ONBOARDING_PATH,
  decideOnboardingGate,
  isOnboardingPath,
  resolvePostOnboardingPath,
} from './onboardingGate';

const base = {
  isAuthenticated: true,
  isInitializing: false,
  pathname: '/',
};

const status = (over: Partial<OnboardingStatus>): OnboardingStatus => ({
  completedAt: '2026-01-01T00:00:00.000Z',
  step: null,
  resumeStep: 'welcome',
  needsOnboarding: false,
  needsSportStep: false,
  ...over,
});

describe('decideOnboardingGate — the four user states', () => {
  it('sends a brand-new user to /welcome', () => {
    expect(
      decideOnboardingGate({
        ...base,
        status: status({ completedAt: null, needsOnboarding: true }),
      }),
    ).toEqual({ action: 'redirect', to: '/welcome' });
  });

  it('sends a user who quit mid-flow to /welcome too (the flow resumes itself)', () => {
    expect(
      decideOnboardingGate({
        ...base,
        status: status({ completedAt: null, needsOnboarding: true, step: 'city', resumeStep: 'city' }),
      }),
    ).toEqual({ action: 'redirect', to: '/welcome' });
  });

  it('never bothers a user who finished', () => {
    expect(decideOnboardingGate({ ...base, status: status({}) })).toEqual({ action: 'allow' });
  });

  it('sends a finished user with no enabled sport to the sport step only', () => {
    expect(
      decideOnboardingGate({ ...base, status: status({ needsSportStep: true }) }),
    ).toEqual({ action: 'redirect', to: '/welcome?step=sport' });
  });
});

describe('decideOnboardingGate — safety rails', () => {
  it('does nothing while auth is still bootstrapping', () => {
    // ProtectedRoute does not wait for the shell bootstrap, so redirecting here
    // would bounce every returning user through /welcome on a cold start.
    expect(
      decideOnboardingGate({
        ...base,
        isInitializing: true,
        status: status({ completedAt: null, needsOnboarding: true }),
      }),
    ).toEqual({ action: 'allow' });
  });

  it('does nothing while the status is unknown or the request failed', () => {
    expect(decideOnboardingGate({ ...base, status: undefined })).toEqual({ action: 'allow' });
    expect(decideOnboardingGate({ ...base, status: null })).toEqual({ action: 'allow' });
  });

  it('does nothing for a guest', () => {
    expect(
      decideOnboardingGate({
        ...base,
        isAuthenticated: false,
        status: status({ completedAt: null, needsOnboarding: true }),
      }),
    ).toEqual({ action: 'allow' });
  });

  it('never redirects a user who is already inside the flow', () => {
    expect(
      decideOnboardingGate({
        ...base,
        pathname: ONBOARDING_PATH,
        status: status({ completedAt: null, needsOnboarding: true }),
      }),
    ).toEqual({ action: 'allow' });
  });

  it('leaves auth routes alone', () => {
    expect(
      decideOnboardingGate({
        ...base,
        pathname: '/login',
        isAuthRoute: true,
        status: status({ completedAt: null, needsOnboarding: true }),
      }),
    ).toEqual({ action: 'allow' });
  });

  it('recognises the onboarding path', () => {
    expect(isOnboardingPath('/welcome')).toBe(true);
    expect(isOnboardingPath('/welcome/anything')).toBe(true);
    expect(isOnboardingPath('/welcomed')).toBe(false);
    expect(isOnboardingPath('/')).toBe(false);
  });
});

describe('resolvePostOnboardingPath — the deep link must survive the flow', () => {
  it('hands back the path the gate interrupted', () => {
    expect(resolvePostOnboardingPath('/games/abc123?join=1', '/find')).toBe('/games/abc123?join=1');
  });

  it('falls back to the closing choice when there is nothing pending', () => {
    expect(resolvePostOnboardingPath(null, '/?playIntentOpen=1')).toBe('/?playIntentOpen=1');
    expect(resolvePostOnboardingPath(undefined, '/find')).toBe('/find');
    expect(resolvePostOnboardingPath('', '/find')).toBe('/find');
  });

  it('refuses to bounce back into the flow', () => {
    expect(resolvePostOnboardingPath('/welcome', '/find')).toBe('/find');
    expect(resolvePostOnboardingPath('/welcome?step=sport', '/find')).toBe('/find');
  });

  it('refuses off-app and protocol-relative targets', () => {
    expect(resolvePostOnboardingPath('//evil.example.com', '/find')).toBe('/find');
    expect(resolvePostOnboardingPath('https://evil.example.com', '/find')).toBe('/find');
  });
});
