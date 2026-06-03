import type { CSSProperties } from 'react';

/** Ground ellipse on rally courts — matches {@link RallyCourtNet} net shadow. */
export const COURT_GROUND_SHADOW_FILL = '#020617';
export const COURT_GROUND_SHADOW_OPACITY = 0.14;

/**
 * Screen-space ellipse under 24px court avatars (same tint as net; larger than raw scene units
 * so it stays visible after court projection).
 */
export const COURT_AVATAR_SHADOW_RX = 11;
export const COURT_AVATAR_SHADOW_RY = 3.5;

export function courtAvatarGroundShadowStyle(): CSSProperties {
  return {
    width: COURT_AVATAR_SHADOW_RX * 2,
    height: COURT_AVATAR_SHADOW_RY * 2,
    backgroundColor: COURT_GROUND_SHADOW_FILL,
    opacity: COURT_GROUND_SHADOW_OPACITY,
    borderRadius: '50%',
  };
}
