import { MatchSetRole } from '@prisma/client';

export function isOfficialMatchSetRole(role: MatchSetRole): boolean {
  return role === MatchSetRole.OFFICIAL;
}

export function parseMatchSetRole(raw: unknown): MatchSetRole {
  if (raw === MatchSetRole.EXTRA_GAMES || raw === 'EXTRA_GAMES') return MatchSetRole.EXTRA_GAMES;
  if (raw === MatchSetRole.EXTRA_BALLS || raw === 'EXTRA_BALLS') return MatchSetRole.EXTRA_BALLS;
  return MatchSetRole.OFFICIAL;
}

export function validateMatchSetRoleOrder(roles: MatchSetRole[]): string | null {
  let seen = false;
  for (const r of roles) {
    if (!isOfficialMatchSetRole(r)) {
      seen = true;
    } else if (seen) {
      return 'Supplemental sets must be at the end of the match';
    }
  }
  return null;
}
