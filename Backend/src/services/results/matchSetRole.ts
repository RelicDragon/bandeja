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

export function isSupplementalMatchSetRole(role: MatchSetRole | string | null | undefined): boolean {
  return role === MatchSetRole.EXTRA_GAMES || role === MatchSetRole.EXTRA_BALLS;
}

export function splitOfficialAndSupplementalSets<T extends { role?: MatchSetRole | string | null }>(
  sets: T[],
): { official: T[]; supplemental: T[] } {
  const i = sets.findIndex((s) => isSupplementalMatchSetRole(s.role ?? MatchSetRole.OFFICIAL));
  if (i === -1) return { official: sets, supplemental: [] };
  return { official: sets.slice(0, i), supplemental: sets.slice(i) };
}
