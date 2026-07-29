import { Sport, type Prisma } from '@prisma/client';

export function followerAudienceWhere(
  creatorUserId: string,
  cityId: string,
  sport: Sport,
): Prisma.UserFavoriteUserWhereInput {
  return {
    favoriteUserId: creatorUserId,
    user: {
      currentCityId: cityId,
      OR:
        sport === Sport.PADEL
          ? [{ sportsEnabled: { has: sport } }, { sportsEnabled: { isEmpty: true } }]
          : [{ sportsEnabled: { has: sport } }],
      blockedUsers: { none: { blockedUserId: creatorUserId } },
      blockedBy: { none: { userId: creatorUserId } },
    },
  };
}
