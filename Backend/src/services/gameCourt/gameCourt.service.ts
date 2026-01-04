import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export class GameCourtService {
  static async getGameCourts(gameId: string) {
    const gameCourts = await prisma.gameCourt.findMany({
      where: { gameId },
      include: {
        court: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    return gameCourts;
  }

  static async setGameCourts(gameId: string, courtIds: string[]) {
    await prisma.$transaction(async (tx) => {
      await tx.gameCourt.deleteMany({
        where: { gameId },
      });

      if (courtIds.length > 0) {
        const uniqueCourtIds = Array.from(new Set(courtIds));
        
        for (let i = 0; i < uniqueCourtIds.length; i++) {
          const courtId = uniqueCourtIds[i];
          
          const court = await tx.court.findUnique({
            where: { id: courtId },
          });

          if (!court) {
            throw new ApiError(404, `Court ${courtId} not found`);
          }

          await tx.gameCourt.create({
            data: {
              gameId,
              courtId,
              order: i + 1,
            },
          });
        }
      }
    });

    return this.getGameCourts(gameId);
  }

  static async addGameCourt(gameId: string, courtId: string) {
    const existingGameCourt = await prisma.gameCourt.findFirst({
      where: {
        gameId,
        courtId,
      },
    });

    if (existingGameCourt) {
      throw new ApiError(400, 'Court already added to game');
    }

    const court = await prisma.court.findUnique({
      where: { id: courtId },
    });

    if (!court) {
      throw new ApiError(404, 'Court not found');
    }

    const maxOrder = await prisma.gameCourt.findFirst({
      where: { gameId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const newOrder = (maxOrder?.order ?? 0) + 1;

    const gameCourt = await prisma.gameCourt.create({
      data: {
        gameId,
        courtId,
        order: newOrder,
      },
      include: {
        court: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
                address: true,
              },
            },
          },
        },
      },
    });

    return gameCourt;
  }

  static async removeGameCourt(gameId: string, gameCourtId: string) {
    const gameCourt = await prisma.gameCourt.findUnique({
      where: { id: gameCourtId },
    });

    if (!gameCourt || gameCourt.gameId !== gameId) {
      throw new ApiError(404, 'Game court not found');
    }

    await prisma.$transaction(async (tx) => {
      await tx.gameCourt.delete({
        where: { id: gameCourtId },
      });

      const remainingCourts = await tx.gameCourt.findMany({
        where: { gameId },
        orderBy: { order: 'asc' },
      });

      for (let i = 0; i < remainingCourts.length; i++) {
        await tx.gameCourt.update({
          where: { id: remainingCourts[i].id },
          data: { order: i + 1 },
        });
      }
    });

    return { success: true };
  }

  static async reorderGameCourts(gameId: string, gameCourtIds: string[]) {
    const existingGameCourts = await prisma.gameCourt.findMany({
      where: { gameId },
    });

    if (existingGameCourts.length !== gameCourtIds.length) {
      throw new ApiError(400, 'Invalid number of game courts');
    }

    await prisma.$transaction(
      gameCourtIds.map((gameCourtId, index) =>
        prisma.gameCourt.update({
          where: { id: gameCourtId },
          data: { order: index + 1 },
        })
      )
    );

    return this.getGameCourts(gameId);
  }
}

