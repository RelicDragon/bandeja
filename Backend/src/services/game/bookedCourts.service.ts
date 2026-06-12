import { ClubIntegrationType, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { loadMergedBusySlots } from '../../shared/booktimeBusySnapshot';

export interface BookedCourtSlot {
  courtId: string | null;
  courtName: string | null;
  integrationCourtName: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
  clubBooked: boolean;
  isFree: boolean;
  slotKind?: 'game' | 'external' | 'hold';
  holdBlocked?: boolean;
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
        { status: { in: ['ANNOUNCED', 'STARTED'] } },
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
        dateConditions.push({
          startTime: {
            lte: new Date(endDate),
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
            integrationCourtName: true,
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
      integrationCourtName: game.court?.integrationCourtName || null,
      startTime: game.startTime.toISOString(),
      endTime: game.endTime.toISOString(),
      hasBookedCourt: game.hasBookedCourt,
      clubBooked: false,
      isFree: false,
      slotKind: 'game',
    }));

    let holdSlots: BookedCourtSlot[] = [];
    if (startDate || endDate) {
      const holdWhere: Prisma.CourtSlotHoldWhereInput = {
        clubId,
        ...(courtId ? { courtId } : {}),
      };
      if (startDate) {
        holdWhere.endTime = { gte: new Date(startDate) };
      }
      if (endDate) {
        holdWhere.startTime = { lte: new Date(endDate) };
      }
      const holds = await prisma.courtSlotHold.findMany({
        where: holdWhere,
        include: { court: { select: { id: true, name: true, integrationCourtName: true } } },
      });
      holdSlots = holds.map((hold) => ({
        courtId: hold.court.id,
        courtName: hold.court.name,
        integrationCourtName: hold.court.integrationCourtName,
        startTime: hold.startTime.toISOString(),
        endTime: hold.endTime.toISOString(),
        hasBookedCourt: true,
        clubBooked: true,
        isFree: false,
        slotKind: 'hold',
        holdBlocked: true,
      }));
    }

    let externalSlots: BookedCourtSlot[] = [];
    let isLoadingExternalSlots = false;

    if (startDate && endDate) {
      const club = await prisma.club.findUnique({
        where: { id: clubId },
        select: { integrationType: true },
      });

      if (club?.integrationType === ClubIntegrationType.BOOKTIME) {
        try {
          const rangeStart = new Date(startDate);
          const rangeEnd = new Date(endDate);

          const { slots: busySlots, isLoading } = await loadMergedBusySlots({
            clubId,
            rangeStart,
            rangeEnd,
            filterCourtId: courtId,
            includeUnmapped: false,
          });
          isLoadingExternalSlots = isLoading;

          externalSlots = busySlots.map((slot) => ({
            courtId: slot.courtId,
            courtName: slot.courtName,
            integrationCourtName: slot.integrationCourtName,
            startTime: slot.startTime,
            endTime: slot.endTime,
            hasBookedCourt: true,
            clubBooked: true,
            isFree: false,
            slotKind: 'external' as const,
          }));
        } catch (error) {
          console.error(`Error loading club booking snapshot for club ${clubId}:`, error);
        }
      }
    }

    return {
      slots: [...bookedSlots, ...holdSlots, ...externalSlots],
      isLoadingExternalSlots,
    };
  }
}

