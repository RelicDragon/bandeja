import { ApiError } from '../../utils/ApiError';
import {
  CourtOccupancyService,
  mapOccupancyBlockToBookedCourtSlot,
  type BookedCourtSlot,
} from './courtOccupancy.service';

export type { BookedCourtSlot };

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

    const hasDateRange = Boolean(startDate || endDate);
    const rangeStart = startDate ? new Date(startDate) : new Date(0);
    const rangeEnd = endDate ? new Date(endDate) : new Date(8640000000000000);

    const { blocks, isLoadingExternalSlots } = await CourtOccupancyService.getOccupancy({
      clubId,
      rangeStart,
      rangeEnd,
      courtId,
      includeUnmapped: false,
      gameCourtFilter: 'player',
      applyDateRange: hasDateRange,
      sources: {
        games: true,
        holds: hasDateRange,
        externals: Boolean(startDate && endDate),
      },
    });

    return {
      slots: blocks.map(mapOccupancyBlockToBookedCourtSlot),
      isLoadingExternalSlots,
    };
  }
}
