import type { NoviceUserFields } from '@shared/novice';
import { showsNoviceWelcome } from '@/utils/noviceShell';
import { isOnboardingPath } from './onboardingGate';

/**
 * PRD 350 — the destination the user was actually heading for when the
 * onboarding gate intercepted them (a shared game link, a club page, …).
 *
 * Session-scoped, exactly like `utils/postLoginRedirect.ts`, so a hard reload
 * mid-flow still lands the user where they meant to go. Consumed once, after
 * the last step — never swallowed.
 */
const POST_ONBOARDING_PATH_KEY = 'bandeja_post_onboarding_path';

function isSafeAppPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !isOnboardingPath(path.split('?')[0]);
}

export function rememberPostOnboardingPath(path: string): void {
  if (!isSafeAppPath(path)) return;
  if (path === '/') return;
  try {
    sessionStorage.setItem(POST_ONBOARDING_PATH_KEY, path);
  } catch {
    // Private-mode storage failures must never break the flow.
  }
}

export function readPostOnboardingPath(): string | null {
  try {
    const path = sessionStorage.getItem(POST_ONBOARDING_PATH_KEY);
    return path && isSafeAppPath(path) ? path : null;
  } catch {
    return null;
  }
}

export function consumePostOnboardingPath(): string | null {
  const path = readPostOnboardingPath();
  clearPostOnboardingPath();
  return path;
}

export function clearPostOnboardingPath(): void {
  try {
    sessionStorage.removeItem(POST_ONBOARDING_PATH_KEY);
  } catch {
    // ignore
  }
}

/**
 * PRD 358 — a Newcomer's closing choice lands on the Welcome page: "browse"
 * (`/find`) becomes home, where the Welcome page lists novice-friendly games.
 * "Play soon" (`/?playIntentOpen=1`) is already home and opens compose there.
 * A deep link the gate intercepted is resolved separately and still wins.
 */
export function noviceFinishDestination(
  destination: string,
  user: NoviceUserFields | null | undefined,
): string {
  if (!showsNoviceWelcome(user)) return destination;
  return destination.split('?')[0] === '/find' ? '/' : destination;
}
