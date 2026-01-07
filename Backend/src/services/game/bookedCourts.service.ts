import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

export interface BookedCourtSlot {
  courtId: string | null;
  courtName: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
  clubBooked: boolean;
}

export class BookedCourtsService {
  static async getBookedCourts(
    clubId: string,
    startDate?: string,
    endDate?: string,
    courtId?: string
  ): Promise<BookedCourtSlot[]> {
    if (!clubId) {
      throw new ApiError(400, 'Club ID is required');
    }

    const where: any = {
      AND: [
        { timeIsSet: true },
        {
          OR: [
            { clubId: clubId },
            {
              court: {
                clubId: clubId,
              },
            },
          ],
        },
      ],
    };

    if (courtId) {
      where.AND.push({
        OR: [
          { courtId: courtId },
          { courtId: null },
        ],
      });
    }

    if (startDate || endDate) {
      const dateConditions: any[] = [];
      
      if (startDate) {
        dateConditions.push({
          endTime: {
            gte: new Date(startDate),
          },
        });
      }
      
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        dateConditions.push({
          startTime: {
            lte: endDateObj,
          },
        });
      }
      
      if (dateConditions.length > 0) {
        where.AND.push(...dateConditions);
      }
    }

    const games = await prisma.game.findMany({
      where,
      include: {
        court: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    const bookedSlots: BookedCourtSlot[] = games.map((game) => ({
      courtId: game.court?.id || null,
      courtName: game.court?.name || null,
      startTime: game.startTime.toISOString(),
      endTime: game.endTime.toISOString(),
      hasBookedCourt: game.hasBookedCourt,
      clubBooked: false,
    }));

    return bookedSlots;
  }
}

