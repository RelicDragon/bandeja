import { UserTeamMemberStatus } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { acceptedMemberUserIds, isUserTeamReady } from './userTeamReady';

export type ChallengeTeamShape = {
  id: string;
  size: number;
  members: Array<{ userId: string; status: UserTeamMemberStatus }>;
};

/**
 * Pair-challenge preconditions (`userTeamChallenge.service.ts`). Pure, unit
 * tested. Throws the API error the route returns; never touches the database.
 */
export function assertChallengePairs(
  viewerId: string,
  challenger: ChallengeTeamShape,
  challenged: ChallengeTeamShape,
): void {
  if (challenger.id === challenged.id) {
    throw new ApiError(400, 'errors.userTeams.challengeSameTeam');
  }
  const viewerRow = challenger.members.find((m) => m.userId === viewerId);
  if (!viewerRow) throw new ApiError(403, 'errors.userTeams.accessDenied');
  if (viewerRow.status !== UserTeamMemberStatus.ACCEPTED) {
    throw new ApiError(403, 'errors.userTeams.notAcceptedMember');
  }
  if (!isUserTeamReady(challenger)) {
    throw new ApiError(400, 'errors.userTeams.notReady');
  }
  if (!isUserTeamReady(challenged)) {
    throw new ApiError(400, 'errors.userTeams.challengeOpponentNotReady');
  }
  const mine = new Set(acceptedMemberUserIds(challenger));
  if (acceptedMemberUserIds(challenged).some((id) => mine.has(id))) {
    throw new ApiError(400, 'errors.userTeams.challengeSameTeam');
  }
}
