import { GameStatus, ParticipantStatus, UserTeamMemberStatus, type EntityType, type Sport } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { acceptedMemberUserIds } from './userTeamReady';

export type UserTeamNextGame = {
  id: string;
  name: string | null;
  sport: Sport;
  entityType: EntityType;
  startTime: Date;
  endTime: Date;
  avatar: string | null;
  club: { id: string; name: string; avatar: string | null } | null;
  city: { id: string; name: string; timezone: string } | null;
};

/**
 * `GET /user-teams/:id/next-game` — the team page's "Next game together" card.
 *
 * The soonest ANNOUNCED game with a set time still ahead where **both** accepted
 * members are `PLAYING` (queue, invites and NON_PLAYING never count, same as
 * slots). The viewer is one of the two players, so every returned game is one
 * they can already open. `null` when there is none or the team is not complete.
 */
export async function getUserTeamNextGame(
  teamId: string,
  viewerId: string,
  now: Date = new Date(),
): Promise<UserTeamNextGame | null> {
  const team = await prisma.userTeam.findUnique({
    where: { id: teamId },
    select: { members: { select: { userId: true, status: true } } },
  });
  if (!team) throw new ApiError(404, 'errors.userTeams.notFound');
  const membership = team.members.find((m) => m.userId === viewerId);
  if (!membership) throw new ApiError(403, 'errors.userTeams.accessDenied');
  if (membership.status !== UserTeamMemberStatus.ACCEPTED) return null;

  const memberIds = acceptedMemberUserIds(team);
  if (memberIds.length < 2) return null;

  return prisma.game.findFirst({
    where: {
      status: GameStatus.ANNOUNCED,
      timeIsSet: true,
      startTime: { gt: now },
      AND: memberIds.map((userId) => ({
        participants: { some: { userId, status: ParticipantStatus.PLAYING } },
      })),
    },
    orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      sport: true,
      entityType: true,
      startTime: true,
      endTime: true,
      avatar: true,
      club: { select: { id: true, name: true, avatar: true } },
      city: { select: { id: true, name: true, timezone: true } },
    },
  });
}
