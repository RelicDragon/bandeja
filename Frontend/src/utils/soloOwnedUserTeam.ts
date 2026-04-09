import type { UserTeam } from '@/types';

export function isSoloOwnedTeam(team: UserTeam, userId: string | undefined): boolean {
  if (!userId) return false;
  const accepted = (team.members ?? []).filter((m) => m.status === 'ACCEPTED');
  return accepted.length === 1 && accepted[0].userId === userId;
}

export function findLatestSoloOwnedTeam(teams: UserTeam[], userId: string | undefined): UserTeam | null {
  if (!userId) return null;
  const solo = teams.filter((t) => isSoloOwnedTeam(t, userId));
  if (solo.length === 0) return null;
  solo.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return solo[0];
}
