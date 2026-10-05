import type { CSSProperties } from 'react';
import { isUserTeamColor, type UserTeamColor } from '@shared/userTeamColors';

/**
 * Two tones per team colour: `light` paints the owner's half (and the start of
 * the solo gradient), `dark` the partner's half. Both carry white initials, so
 * each tone stays dark enough for white text at the avatar's size.
 */
export const USER_TEAM_COLOR_TONES: Record<UserTeamColor, { light: string; dark: string }> = {
  court: { light: '#1f9d66', dark: '#0f5a3b' },
  lime: { light: '#6f9c12', dark: '#3f5d09' },
  amber: { light: '#e08a12', dark: '#9a4f07' },
  coral: { light: '#ec5f50', dark: '#a62b25' },
  rose: { light: '#df4f8f', dark: '#951b55' },
  violet: { light: '#8463ea', dark: '#4a2ca3' },
  graphite: { light: '#6b6b74', dark: '#26262b' },
};

/** Tones for a stored `UserTeam.color`, or `null` for the app default (primary). */
export function userTeamColorTones(color: string | null | undefined): { light: string; dark: string } | null {
  return isUserTeamColor(color) ? USER_TEAM_COLOR_TONES[color] : null;
}

/**
 * The team's colour as an ambient wash (hero background). Default follows the
 * member's primary colour. A team photo does not change it: the colour is the
 * team's, the photo only fills the picture.
 */
export function userTeamWashStyle(color: string | null | undefined): CSSProperties {
  const tones = userTeamColorTones(color);
  const light = tones?.light ?? 'var(--member-primary-400, #38bdf8)';
  const dark = tones?.dark ?? 'var(--member-primary-700, #0369a1)';
  return {
    backgroundImage: [
      `radial-gradient(70% 90% at 15% 0%, color-mix(in srgb, ${light} 55%, transparent), transparent 70%)`,
      `radial-gradient(65% 85% at 90% 5%, color-mix(in srgb, ${dark} 45%, transparent), transparent 70%)`,
      `linear-gradient(180deg, color-mix(in srgb, ${light} 22%, transparent), transparent)`,
    ].join(', '),
  };
}
