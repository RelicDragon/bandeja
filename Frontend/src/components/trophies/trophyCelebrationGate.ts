/** Cross-mount gate so Results + profile hosts cannot open the same unlock twice. */

const softClaimedIds = new Set<string>();
/** Only one celebration sheet may be open app-wide. */
let activeSessionId: string | null = null;

export const TROPHY_CELEBRATION_RELEASED = 'trophyCelebration:released';

export function celebrationStorageKey(achievementId: string): string {
  return `trophyCelebration:id:${achievementId}`;
}

export function isCelebrationPersisted(achievementId: string): boolean {
  try {
    return Boolean(localStorage.getItem(celebrationStorageKey(achievementId)));
  } catch {
    return false;
  }
}

export function wasCelebrationShown(achievementId: string): boolean {
  return softClaimedIds.has(achievementId) || isCelebrationPersisted(achievementId);
}

function notifyCelebrationReleased(achievementId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(TROPHY_CELEBRATION_RELEASED, { detail: { achievementId } }),
  );
}

/**
 * Soft claim for the open attempt.
 * Rejects if already shown OR another celebration session is active.
 */
export function claimCelebration(achievementId: string): boolean {
  if (wasCelebrationShown(achievementId)) return false;
  if (activeSessionId != null && activeSessionId !== achievementId) return false;
  softClaimedIds.add(achievementId);
  activeSessionId = achievementId;
  return true;
}

export function releaseCelebrationClaim(achievementId: string): void {
  softClaimedIds.delete(achievementId);
  if (activeSessionId === achievementId) {
    activeSessionId = null;
  }
  notifyCelebrationReleased(achievementId);
}

/** Persist after the user actually saw/dismissed the sheet. */
export function markCelebrationShown(achievementId: string): void {
  softClaimedIds.add(achievementId);
  try {
    localStorage.setItem(celebrationStorageKey(achievementId), '1');
  } catch {
    // ignore quota / private mode
  }
  if (activeSessionId === achievementId) {
    activeSessionId = null;
  }
  // Wake other hosts so they can claim the next unseen unlock.
  notifyCelebrationReleased(achievementId);
}
