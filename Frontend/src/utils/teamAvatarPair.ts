import type { BasicUser, UserTeam } from '@/types';

export function getTeamAvatarPair(team: UserTeam): { primary: BasicUser; secondary: BasicUser | null } {
  const primary = team.owner;
  const members = team.members ?? [];
  const accepted = members.find((m) => !m.isOwner && m.status === 'ACCEPTED');
  const pending = members.find((m) => !m.isOwner && m.status === 'PENDING');
  const secondary = accepted?.user ?? pending?.user ?? null;
  return { primary, secondary };
}
