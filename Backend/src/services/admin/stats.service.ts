import prisma from '../../config/database';

export class AdminStatsService {
  static async getStats(cityId?: string) {
    const [totalUsers, totalGames, totalCities, totalClubs, activeGames, totalInvites] = await Promise.all([
      prisma.user.count({
        where: cityId ? { currentCityId: cityId } : undefined,
      }),
      prisma.game.count({
        where: cityId ? {
          court: {
            club: {
              cityId: cityId,
            },
          },
        } : undefined,
      }),
      prisma.city.count(),
      prisma.club.count({
        where: {
          isActive: true,
          ...(cityId && { cityId: cityId }),
        },
      }),
      prisma.game.count({
        where: {
          status: { not: 'ARCHIVED' },
          ...(cityId && {
            court: {
              club: {
                cityId: cityId,
              },
            },
          }),
        },
      }),
      prisma.gameParticipant.count({
        where: {
          status: 'INVITED',
          game: {
            status: { not: 'ARCHIVED' },
            ...(cityId && {
              court: {
                club: {
                  cityId: cityId,
                },
              },
            }),
          },
        },
      }),
    ]);

    return {
      totalUsers,
      totalGames,
      totalCities,
      totalClubs,
      activeGames,
      totalInvites,
    };
  }
}
