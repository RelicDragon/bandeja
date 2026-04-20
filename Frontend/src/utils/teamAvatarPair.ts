import type { BasicUser, UserTeam } from '@/types';

export function getTeamAvatarPair(team: UserTeam): { primary: BasicUser; secondary: BasicUser | null } {
  const primary = team.owner;
  const members = team.members ?? [];
  const accepted = members.find((m) => !m.isOwner && m.status === 'ACCEPTED');
  const pending = members.find((m) => !m.isOwner && m.status === 'PENDING');
  const secondary = accepted?.user ?? pending?.user ?? null;
  return { primary, secondary };
}

export function getTeamParticipantUsers(team: UserTeam): BasicUser[] {
  const ids = new Set<string>();
  const out: BasicUser[] = [];
  const push = (u: BasicUser) => {
    if (ids.has(u.id)) return;
    ids.add(u.id);
    out.push(u);
  };
  push(team.owner);
  for (const m of team.members ?? []) {
    if (m.status === 'DECLINED') continue;
    push(m.user);
  }
  return out;
}
