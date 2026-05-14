export type MatchSetRole = 'OFFICIAL' | 'EXTRA_GAMES' | 'EXTRA_BALLS';

/** Max per-team score in results UI for supplemental row when unit is balls. */
export const EXTRA_BALLS_SCORE_MAX = 42;

export interface SetRoleFields {
  role?: MatchSetRole;
}

export function parseMatchSetRole(raw: unknown): MatchSetRole {
  if (raw === 'EXTRA_GAMES') return 'EXTRA_GAMES';
  if (raw === 'EXTRA_BALLS') return 'EXTRA_BALLS';
  return 'OFFICIAL';
}

export function isOfficialMatchSet(set: SetRoleFields): boolean {
  return !set.role || set.role === 'OFFICIAL';
}

export function isSupplementalMatchSet(set: SetRoleFields): boolean {
  return set.role === 'EXTRA_GAMES' || set.role === 'EXTRA_BALLS';
}

export function splitOfficialAndSupplementalSets<T extends SetRoleFields>(sets: T[]): {
  official: T[];
  supplemental: T[];
} {
  const i = sets.findIndex(isSupplementalMatchSet);
  if (i === -1) return { official: sets, supplemental: [] };
  return { official: sets.slice(0, i), supplemental: sets.slice(i) };
}

export function validateSupplementalSetOrder(roles: MatchSetRole[]): string | null {
  let seen = false;
  for (const r of roles) {
    if (r !== 'OFFICIAL') {
      seen = true;
    } else if (seen) {
      return 'Supplemental sets must be at the end of the match';
    }
  }
  return null;
}
