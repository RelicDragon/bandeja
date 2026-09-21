import { onboardingApi } from '@/api/onboarding';
import type { OnboardingStep } from './onboardingSteps';

/**
 * PRD 350 analytics — `onboarding_step_viewed` / `_completed` / `_skipped`.
 *
 * Two sinks, because the app has no analytics product:
 *
 *  • the **server**, through `PATCH /users/me/onboarding`, which already records
 *    the step and now logs the funnel event beside it. This is the one that
 *    survives the session — without it a *skipped* step is invisible, since
 *    `onboardingStep` records only how far somebody got;
 *  • a DOM `CustomEvent` on `window`, kept as the in-page seam so a real client
 *    can be added later by listening for {@link ONBOARDING_ANALYTICS_EVENT}
 *    without touching a single call site.
 *
 * Both are best-effort: a funnel event must never block or fail a step.
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
  /**
   * `false` in the sport-only re-entry, where the account is already completed
   * and the flow deliberately writes nothing to the server.
   */
  persist?: boolean;
}

export function emitOnboardingEvent(detail: OnboardingAnalyticsDetail): void {
  /*
   * `viewed` is already persisted by the flow's own resume write, and the
   * sport-only re-entry must not write at all (that account is completed). So
   * only the two events nothing else records are posted, and only when the flow
   * is persisting. Fire-and-forget: the funnel never gates a step.
   */
  if (detail.persist !== false && detail.name !== 'onboarding_step_viewed') {
    void onboardingApi.setStep(detail.step, detail.name).catch(() => undefined);
  }

  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(
    new CustomEvent<OnboardingAnalyticsDetail>(ONBOARDING_ANALYTICS_EVENT, { detail }),
  );
}
