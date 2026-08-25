import type { AddUserTeamToGameResult } from '@/api/userTeams';

export function addToGameToastKind(
  result: Pick<AddUserTeamToGameResult, 'invitedUserIds' | 'pairSeated'>,
): 'seated' | 'invited' | 'added' {
  if (result.pairSeated) return 'seated';
  if (result.invitedUserIds.length > 0) return 'invited';
  return 'added';
}
