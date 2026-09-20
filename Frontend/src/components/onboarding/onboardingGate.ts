import type { OnboardingStatus } from '@/api/onboarding';

/**
 * PRD 350 — the routing gate, as a pure function so all four user states can be
 * unit-tested without a router.
 *
 * Rules, in order:
 *   · never redirect while auth is still bootstrapping or the status is unknown
 *     — `ProtectedRoute` does not wait for the shell bootstrap, so redirecting
 *     early would bounce a returning user through `/welcome` on every cold
 *     start;
 *   · `onboardingCompletedAt === null` → the whole flow;
 *   · completed but no enabled sport → `/welcome?step=sport` only;
 *   · anyone already on `/welcome` stays there.
 */
export const ONBOARDING_PATH = '/welcome';
export const ONBOARDING_SPORT_ONLY_SEARCH = '?step=sport';

export interface OnboardingGateInput {
  isAuthenticated: boolean;
  /** `useAuthStore().isInitializing` — true during cold-start token recovery. */
  isInitializing: boolean;
  /** `undefined` while the status query is in flight or has failed. */
  status: OnboardingStatus | null | undefined;
  /** Current `location.pathname`. */
  pathname: string;
  /** Whether the current route is an auth route (`/login`, `/register`, …). */
  isAuthRoute?: boolean;
}

export type OnboardingGateDecision =
  | { action: 'allow' }
  | { action: 'redirect'; to: string };

export function isOnboardingPath(pathname: string): boolean {
  return pathname === ONBOARDING_PATH || pathname.startsWith(`${ONBOARDING_PATH}/`);
}

export function decideOnboardingGate(input: OnboardingGateInput): OnboardingGateDecision {
  if (!input.isAuthenticated) return { action: 'allow' };
  if (input.isInitializing) return { action: 'allow' };
  if (input.isAuthRoute) return { action: 'allow' };
  if (isOnboardingPath(input.pathname)) return { action: 'allow' };

  const status = input.status;
  // Unknown status (first load, offline, request failed) must never bounce the
  // user — a failed GET is not evidence that onboarding is unfinished.
  if (!status) return { action: 'allow' };

  if (status.needsOnboarding) return { action: 'redirect', to: ONBOARDING_PATH };
  if (status.needsSportStep) {
    return { action: 'redirect', to: `${ONBOARDING_PATH}${ONBOARDING_SPORT_ONLY_SEARCH}` };
  }
  return { action: 'allow' };
}

/**
 * Where to send the user once the flow finishes. A deep link they followed
 * before the gate intercepted them wins over Home, but only when it is a safe
 * in-app path and not the onboarding route itself.
 */
export function resolvePostOnboardingPath(
  pendingPath: string | null | undefined,
  fallback: string,
): string {
  if (!pendingPath) return fallback;
  if (!pendingPath.startsWith('/') || pendingPath.startsWith('//')) return fallback;
  if (isOnboardingPath(pendingPath.split('?')[0])) return fallback;
  return pendingPath;
}
