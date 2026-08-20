import { UserTeamMemberStatus } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { applyUserTeamToFixedTeamsIfReady } from '../game/userTeamFixedTeams.service';

export async function stampInviteUserTeamId(
  gameId: string,
  userId: string,
  userTeamId: string,
): Promise<void> {
  const team = await prisma.userTeam.findUnique({
    where: { id: userTeamId },
    include: { members: true },
  });
  if (!team) throw new ApiError(400, 'errors.userTeams.notFound');
  const accepted = team.members.filter((m) => m.status === UserTeamMemberStatus.ACCEPTED);
  if (accepted.length < team.size) {
    throw new ApiError(400, 'errors.userTeams.invalidInvite');
  }
  if (!accepted.some((m) => m.userId === userId)) {
    throw new ApiError(400, 'errors.userTeams.memberNotFound');
  }
  await prisma.gameParticipant.updateMany({
    where: { gameId, userId },
    data: { inviteUserTeamId: userTeamId },
  });
  await applyUserTeamToFixedTeamsIfReady(gameId, userTeamId);
}
