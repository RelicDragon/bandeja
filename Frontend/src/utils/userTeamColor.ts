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
