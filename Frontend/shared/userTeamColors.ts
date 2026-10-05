/**
 * Palette keys a user team may pick as its colour (`UserTeam.color`).
 * `null` means "app default" (the member's primary colour). The API validates
 * against this list; the tones live in the Frontend (`utils/userTeamColor.ts`).
 */
export const USER_TEAM_COLORS = ['court', 'lime', 'amber', 'coral', 'rose', 'violet', 'graphite'] as const;

export type UserTeamColor = (typeof USER_TEAM_COLORS)[number];

export function isUserTeamColor(value: unknown): value is UserTeamColor {
  return typeof value === 'string' && (USER_TEAM_COLORS as readonly string[]).includes(value);
}
