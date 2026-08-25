export function isUserTeamReady(team: {
  size: number;
  members: Array<{ status: string }>;
}): boolean {
  const accepted = team.members.filter((m) => m.status === 'ACCEPTED').length;
  return accepted >= team.size;
}

export function acceptedMemberUserIds(team: {
  members: Array<{ status: string; userId: string }>;
}): string[] {
  return team.members.filter((m) => m.status === 'ACCEPTED').map((m) => m.userId);
}

export function classifyMembersForAddToGame(
  acceptedUserIds: string[],
  participants: Array<{ userId: string; status: string }>,
): { toInvite: string[]; toTag: string[]; toPromoteFromQueue: string[] } {
  const byUser = new Map(participants.map((p) => [p.userId, p]));
  const toInvite: string[] = [];
  const toTag: string[] = [];
  const toPromoteFromQueue: string[] = [];
  for (const userId of acceptedUserIds) {
    const row = byUser.get(userId);
    if (!row) toInvite.push(userId);
    else if (row.status === 'IN_QUEUE') toPromoteFromQueue.push(userId);
    else toTag.push(userId);
  }
  return { toInvite, toTag, toPromoteFromQueue };
}

export type PartnerOnGame = 'none' | 'invited' | 'playing' | 'queued' | 'other';

export function partnerOnGameStatus(
  partnerId: string | undefined,
  participants: Array<{ userId: string; status: string }>,
): PartnerOnGame {
  if (!partnerId) return 'none';
  const row = participants.find((p) => p.userId === partnerId);
  if (!row) return 'none';
  if (row.status === 'PLAYING') return 'playing';
  if (row.status === 'INVITED') return 'invited';
  if (row.status === 'IN_QUEUE') return 'queued';
  return 'other';
}

export function includeFullGameForPartner(status: PartnerOnGame): boolean {
  return status === 'playing' || status === 'invited' || status === 'other';
}
