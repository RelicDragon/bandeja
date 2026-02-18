import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ClubIntegrationService } from '../clubIntegration/clubIntegration.service';

export interface BookedCourtSlot {
  courtId: string | null;
  courtName: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
  clubBooked: boolean;
  isFree: boolean;
}

export interface BookedCourtsResult {
  slots: BookedCourtSlot[];
  isLoadingExternalSlots: boolean;
}

export class BookedCourtsService {
  static async getBookedCourts(
    clubId: string,
    startDate?: string,
    endDate?: string,
    courtId?: string
  ): Promise<BookedCourtsResult> {
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
      isFree: false,
    }));

    let externalSlots: BookedCourtSlot[] = [];
    let isLoadingExternalSlots = false;

    if (startDate && endDate) {
      try {
        const club = await prisma.club.findUnique({
          where: { id: clubId },
          select: {
            id: true,
            integrationScriptName: true,
            integrationScriptDateIndependent: true,
          },
        });

        if (club?.integrationScriptName) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          const duration = 1;

          const { slots: externalRawSlots, isLoading } =
            await ClubIntegrationService.getExternalSlots(clubId, start, end, duration);

          isLoadingExternalSlots = isLoading;

          const mappedSlots =
            await ClubIntegrationService.mapExternalSlotsToCourts(
              clubId,
              externalRawSlots
            );

          externalSlots = mappedSlots
            .filter(
              (slot) =>
                slot.internalCourtId !== null &&
                slot.isBooked === true &&
                (!courtId || slot.internalCourtId === courtId)
            )
            .map((slot) => ({
              courtId: slot.internalCourtId,
              courtName: slot.internalCourtName || slot.externalCourtName,
              startTime: slot.startTime,
              endTime: slot.endTime,
              hasBookedCourt: slot.isBooked,
              clubBooked: true,
              isFree: false,
            }));
        }
      } catch (error) {
        console.error(
          `Error checking external slots for club ${clubId}:`,
          error
        );
      }
    }

    return {
      slots: [...bookedSlots, ...externalSlots],
      isLoadingExternalSlots,
    };
  }
}

