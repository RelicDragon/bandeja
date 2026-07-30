type AdLandingWishVisibilityCandidate = {
  displayName: string;
  message: string;
};

const HIDDEN_SMOKE_PROBE_SIGNATURES = new Set([
  'CI Check\u0000post-deploy',
  'Anon\u0000no token',
]);

/**
 * These payloads were submitted by a one-off production smoke check on
 * 2026-07-27. They validate the public POST route but are not birthday wishes.
 */
export function isKnownAdLandingWishSmokeProbe(
  wish: AdLandingWishVisibilityCandidate
): boolean {
  return HIDDEN_SMOKE_PROBE_SIGNATURES.has(`${wish.displayName}\u0000${wish.message}`);
}
