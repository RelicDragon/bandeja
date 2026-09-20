import type { OnboardingStep } from './onboardingSteps';

/**
 * PRD 350 analytics — `onboarding_step_viewed` / `_completed` / `_skipped`.
 *
 * The app has no analytics client today (there is no `logEvent` anywhere in
 * `Frontend/src`), so this module is the seam: it dispatches a DOM
 * `CustomEvent` on `window` and nothing else. When a real sink is added, listen
 * for {@link ONBOARDING_ANALYTICS_EVENT} — no call site has to change.
 */
export const ONBOARDING_ANALYTICS_EVENT = 'bandeja:analytics';

export type OnboardingAnalyticsName =
  | 'onboarding_step_viewed'
  | 'onboarding_step_completed'
  | 'onboarding_step_skipped';

export interface OnboardingAnalyticsDetail {
  name: OnboardingAnalyticsName;
  step: OnboardingStep;
  /** 1-based position among the steps this account actually sees. */
  position: number;
  total: number;
}

export function emitOnboardingEvent(detail: OnboardingAnalyticsDetail): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(
    new CustomEvent<OnboardingAnalyticsDetail>(ONBOARDING_ANALYTICS_EVENT, { detail }),
  );
}
