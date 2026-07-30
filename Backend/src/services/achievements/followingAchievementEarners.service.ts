import { getAchievementDefinition } from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { projectEmbeddedUserByPrimarySport } from '../user/projectEmbeddedBasicUsers';

export const MAX_FOLLOWING_ACHIEVEMENT_EARNERS = 100;

export async function getFollowingAchievementEarners(
  userId: string,
  definitionId: string,
  db: typeof prisma = prisma,
) {
  if (!getAchievementDefinition(definitionId)) {
    throw new ApiError(404, 'Achievement not found');
  }

  const rows = await db.userFavoriteUser.findMany({
    where: {
      userId,
      favoriteUser: {
        isActive: true,
        achievements: {
          some: {
            definitionId,
            isActive: true,
          },
        },
        blockedUsers: { none: { blockedUserId: userId } },
        blockedBy: { none: { userId } },
      },
    },
    select: {
      favoriteUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
          primarySport: true,
          socialLevel: true,
          gender: true,
          approvedLevel: true,
          isTrainer: true,
          sportProfiles: {
            select: {
              sport: true,
              level: true,
              reliability: true,
              gamesPlayed: true,
              gamesWon: true,
              approvedLevel: true,
              approvedById: true,
              approvedWhen: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_FOLLOWING_ACHIEVEMENT_EARNERS,
  });

  return rows.map((row) => projectEmbeddedUserByPrimarySport(row.favoriteUser));
}
